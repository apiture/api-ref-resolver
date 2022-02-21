// import * as yaml from 'js-yaml';
import { strict as assert } from 'assert';
import * as fs from 'fs'
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import * as bl from 'bl';
import * as yaml from 'js-yaml';

import { Ancestry } from './Ancestry';
import { JsonKeys } from './JsonKeys';

/**
 * ApiObject represents an OpenAPI or Async API object
 */
export type ApiObject = Record<string, object|[]|boolean|null|number>;

/**
 * A container: a JSON object or array - a container node
 */
export type Node = object | [];

// eslint-disable-next-line no-unused-vars
export type RefVisitor = (node: Node, path: JsonKeys, ancestry: Ancestry) => Node;

export interface ApiRefOptions {
  /** If true, log more info to console.warn */
  verbose?: boolean;

  /**
   * What to do id two different resolutions define the same component,
   * either rename the second one by adding a unique integer suffix, or
   * throw an error. The default is `rename`. The result includes a list
   * of renamed components.
   */
  conflictStrategy?: 'error' | 'rename';

  /**
   * Output format for stdout; default is `yaml`
   */
  outputFormat?: 'yaml' | 'json';
}

export interface ApiRefResolved {
  api: ApiObject;
  options: ApiRefOptions;
}

/**
 * ApiRefResolver resolves multi-file API definition documents by replacing
 * external `{$ref: "uri"}` [JSON Reference](https://datatracker.ietf.org/doc/html/draft-pbryan-zyp-json-ref-03)
 * objects with the object referenced at the `uri`.
 */
export class ApiRefResolver {
  /** The URL of the current API being processed */
  private url: URL;

  // The protocol of `this.url`; usually one of '`file'|'http'|'https'`
  // private urlProtocol : string;
  private options: ApiRefOptions;

  private apiDocument: ApiObject;
  /**
   * Maps normalized path names or URLs to API document objects
   */
  private urlToApiObjectMap: { [path: string]: ApiObject } = {};

  /**
   * Maps $ref strings to their resolved $ref strings
   */
  private resolvedRefToRefMap: { [path: string]: string } = {};

  // private options: ApiRefOptions = {};

  public constructor(uri: string | URL, apiDocument?: ApiObject) {

    if (typeof uri === 'string') {
      if (/^\w+:/.exec(uri)) {
        this.url = new URL(uri);
      } else {
        this.url = pathToFileURL(path.resolve(__dirname, uri));
      }
    } else {
      this.url = uri;
    }
    if (apiDocument) {
      this.apiDocument = apiDocument;
    }
  }

  async resolve(options?: ApiRefOptions): Promise<ApiRefResolved> {
    // this.urlProtocol = this.url.protocol;

    if (!this.apiDocument) {
        this.apiDocument = await this.api(this.url);
    }
    this.urlToApiObjectMap[this.url.toString()] = this.apiDocument;
    this.options = options;
    this.walkObject(this.apiDocument, new JsonKeys(), new Ancestry(this.apiDocument), this.refVisitor);
    return { api: this.apiDocument, options: this.options };
  }

  /**
   * @param ref a `$ref` URI
   * @returns the replacement `$ref` to a previously process/resolved `$ref` string
   */
  private replacementForRef(ref: string): string {
    return this.resolvedRefToRefMap[ref];
  }

  /**
   * @param ref a `$ref` URI
   * @returns the replacement `$ref` to a previously process/resolved `$ref` string
   */
  private rememberReplacementForRef(ref: string, replacementRef: string) {
    assert(!this.resolvedRefToRefMap[ref], `ref ${ref} already has a replacement, ${this.resolvedRefToRefMap[ref]}`);
    this.resolvedRefToRefMap[ref] = replacementRef;
  }

  /**
   * Read an API document from a file: URL
   * @param url the URL where the API is located
   */
  private async readFromFile(url: URL): Promise<string> {
    const text = fs.readFileSync(fileURLToPath(url), { encoding: 'utf8' });
    return text;
  }

  private async readFromUrl(url: URL): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.protocol === 'http' ? require('http') : require('https');
      protocol.get(url, (response) => {
        response.setEncoding('utf8');
        response.pipe(
          bl((err, data) => {
            if (err) {
              reject(err);
            }
            resolve(data.toString());
          }),
        );
      });
    });
  }

  public async api(uri: string | URL): Promise<ApiObject> {
    const url = typeof uri === 'string' ? pathToFileURL(uri) : uri;
    const seen = this.urlToApiObjectMap[url.toString()];
    if (seen) {
      return seen;
    }

    const text = url.protocol === 'file:' ? await this.readFromFile(url) : await this.readFromUrl(url);
    const api = yaml.load(text, { filename: url.toString(), schema: yaml.JSON_SCHEMA});
    this.urlToApiObjectMap[url.toString()] = api;
    return api;
  }

  /**
   * Process a JSON reference object and possibly replace the node
   * as per the replacement rules outlined in README.me
   * @param node a JSON Reference object
   * @param path the path to this JSON reference in the containing API document
   * @param ancestry the chain of ancestor objects.
   */
  private async refVisitor(node: object, path: JsonKeys, ancestry: Ancestry): Promise<Node> {
    const ref = node['$ref'] as string;
    console.log(`seen $ref ${ref} at path ${path.toJsonPointer()}`);
    if (ref.startsWith('#')) {
      return node;
    }
    const replacement = this.replacementForRef(ref);
    if (replacement) {
      node['$ref'] = replacement;
      return node;
    }
    const url = new URL(ref);
    const fragment = url.hash;
    if (!fragment) {
      return this.processFullReplacement(url, node, ref, path, ancestry);
    } else if (this.componentRegex().exec(fragment)) {
      return this.processComponentReplacement(url, node, ref, path, ancestry);
    } else {
      return this.processOtherReplacement(url, node, ref, path, ancestry);
    }
  }

  /**
   * @returns A new `RegExp` which only matches an API component `/components/<section>/<componentName>`
   */
  private componentRegex() {
    return /^\/components\/\w+\/[^/]+$/;
  }

  private async processComponentReplacement(
    url: URL,
    node: object,
    ref: string,
    path: JsonKeys,
    ancestry: Ancestry,
  ): Promise<object> {
    assert(path);
    assert(ancestry);
    // TODO: change this to resolved ref
    if (this.url) {
      this.rememberReplacementForRef(ref, ref);
    }
    return node;
  }

  private async processFullReplacement(
    url: URL,
    node: object,
    ref: string,
    path: JsonKeys,
    ancestry: Ancestry,
  ): Promise<object> {
    assert(path);
    assert(ancestry);
    // TODO: change this to resolved ref
    if (this.url) {
      this.rememberReplacementForRef(ref, ref);
    }
    return node;
  }

  private async processOtherReplacement(
    url: URL,
    node: object,
    ref: string,
    path: JsonKeys,
    ancestry: Ancestry,
  ): Promise<object> {
    assert(path);
    assert(ancestry);
    // TODO: change this to resolved ref
    if (this.url) {
      this.rememberReplacementForRef(ref, ref);
    }
    return node;
  }

  /**
   * Walk a JSON object or array and apply f when a $ref is found
   * @param node a node in the OpenAPI document
   * @param path the path to this node, such as `[ 'components', 'schemas', 'mySchema', 'allOf', 0 ]`
   * @param ancestry the parent objects, one per path element.
   * @param f the function to call on found reference objects
   * @return the modified (annotated) node
   */
  private walkObject(node: object, path: JsonKeys, ancestry: Ancestry, f: RefVisitor): object {
    if (this.isRef(node)) {
      f(node, path, ancestry);
    }
    const modNode: object = node;
    const keys = [...Object.keys(node)]; // make copy since this code may re-enter objects
    keys.forEach((key) => {
      let val = node[key];
      if (val !== null && val instanceof Array) {
        val = this.walkArray(val as [], path.with(key), ancestry.with(modNode), f);
      } else if (val !== null && typeof val === 'object') {
        val = this.walkObject(val, path.with(key), ancestry.with(modNode), f);
      }
      node[key] = val;
    });
    return modNode;
  }

  isRef(node: Node): boolean {
    return node !== null && typeof node === 'object' && node.hasOwnProperty('$ref') && typeof node['$ref'] === 'string';
  }

  /**
   * Walk an array and apply f to any item that is a ref object
   * @param a an array node in the OpenAPI document
   * @param path the path to this node.
   * @param ancestry the parent objects, one per path element.
   * @param f the function to call on found reference objects
   * @return the modified (annotated) node
   */
  private walkArray(a: [], path: JsonKeys, ancestry: Ancestry, f): [] {
    for (let index = 0; index < a.length; index = index + 1) {
      const val = a[index] as Node;
      const itemPath = path.with(index);
      const itemAncestry = ancestry.with(a);
      if (val !== null && typeof val === 'object') {
        const modified = this.walkObject(val, itemPath, itemAncestry, f) as object;
        (a as Node[])[index] = modified;
      } else if (val !== null && val instanceof Array) {
        const modified = this.walkArray(val as [], itemPath, itemAncestry, f) as [];
        (a as Node[])[index] = modified;
      }
    }
    return a;
  }
}

export default ApiRefResolver;
