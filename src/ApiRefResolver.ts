// import * as yaml from 'js-yaml';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import * as bl from 'bl';
import * as yaml from 'js-yaml';

import { JsonNavigation, JsonKey, JsonItem } from './JsonNavigation';
import { walkObject, visitRefObjects, RefVisitor } from './RefVisitor';
import type { Node, RefObject } from './RefVisitor';

/**
 * ApiObject represents an OpenAPI or Async API object
 */
export type ApiObject = object; /* actually a object|[]|string|boolean|null|number; */

/**
 * An ApiObject read from a URL and optional fragment
 */
interface ApiResource {
  /** The URL that was used to fetch the resource */
  url: URL;
  /** The API document at the URL */
  api: ApiObject;
  /** The URL fragment, if it existed in the `url` */
  fragment?: string;
  /** The item within the API document at the given fragment, if any */
  item?: JsonItem;
}

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
  private urlToApiObjectMap: { [path: string]: ApiObject };

  /**
   * Maps $ref strings to their resolved $ref strings
   */
  private resolvedRefToRefMap: { [path: string]: string };

  private dateTime: string;

  private changed;

  public constructor(uri: string | URL, apiDocument?: ApiObject) {
    this.resolvedRefToRefMap = {};
    this.urlToApiObjectMap = {};
    this.dateTime = new Date().toISOString();
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
    this.options = options || {};

    if (!this.apiDocument) {
      const apiResource = await this.api(this.url);
      this.apiDocument = apiResource.api;
    }
    this.urlToApiObjectMap[this.url.href] = this.apiDocument;

    const refVisitor: RefVisitor = (node: RefObject, nav: JsonNavigation) => {
      return this.refResolvingVisitor(node, nav);
    };

    this.changed = true;
    while (this.changed) {
      this.changed = false;
      this.apiDocument = (await visitRefObjects(this.apiDocument, refVisitor)) as ApiObject;
    }
    this.apiDocument = await this.cleanup(this.apiDocument);
    return { api: this.apiDocument, options: this.options };
  }

  /**
   * Cleanup the final resolved object by removing temporary `x__resolved__` tags
   * @param resolved the APi document after resolving the `$ref` objects
   * @returns the cleansed `resolved` object
   */
  async cleanup(resolved: ApiObject): Promise<object> {
    return (await walkObject(resolved, async (node: object) => {
      if (node.hasOwnProperty('x__resolved__')) {
        delete node['x__resolved__'];
      }
      return node;
    })) as object;
  }

  /**
   * @param reference a `$ref` URI
   * @returns the replacement `$ref` to a previously process/resolved `$ref` string
   */
  private replacementForRef(reference: string): string {
    return this.resolvedRefToRefMap[reference];
  }

  /**
   * Remember that `ref` should now be replaced with `replacementRef`.
   * Look up replacements with `replacementForRef(reference)`.
   * @param reference an external `$ref` URI that has been resolved
   * @param replacementRef the new reference. It could be relative
   * to the current document (`#/components/schemas/mySchema`)
   * or it could be a ref in another API document
   * (`../apis/other.yaml#/components/schemas/mySchema` or
   * `https://api.eample.com/apis/other.yaml#/components/schemas/mySchema`)
   */
  private rememberReplacementForRef(reference: string, replacementRef: string) {
    assert(
      !this.resolvedRefToRefMap[reference],
      `ref ${reference} already has a replacement, ${this.resolvedRefToRefMap[reference]}`,
    );
    this.resolvedRefToRefMap[reference] = replacementRef;
  }

  /**
   * Read an API document from a file: URL
   * @param url the URL where the API is located
   */
  private async readFromFile(url: URL): Promise<string> {
    const fileUrl = ApiRefResolver.urlNonFragment(url);
    const filePath = fileURLToPath(fileUrl);
    const text = fs.readFileSync(filePath, { encoding: 'utf8' });
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

  /**
   * Read an API document
   * @param uri The string or URL of then API document to read
   * @returns the object at that URL and optionally an API element
   * at the fragment from the API document
   */
  public async api(uri: string | URL): Promise<ApiResource> {
    const url = typeof uri === 'string' ? pathToFileURL(uri) : uri;
    const urlKey = ApiRefResolver.urlNonFragment(url);
    const fragment = ApiRefResolver.urlFragment(url);
    let api = this.urlToApiObjectMap[url.href];
    if (api) {
      const item = fragment ? new JsonNavigation(api).itemAtFragment(fragment) : undefined;
      return { url, api, fragment: fragment, item };
    }
    const text = url.protocol === 'file:' ? await this.readFromFile(url) : await this.readFromUrl(url);
    api = yaml.load(text, { filename: url.href, schema: yaml.JSON_SCHEMA });
    // Cache the api object by the URL
    this.urlToApiObjectMap[urlKey.href] = api;
    const item = fragment ? new JsonNavigation(api).itemAtFragment(fragment) : undefined;
    return { url: urlKey, api, fragment, item };
  }
  static urlNonFragment(url: URL) {
    const urlNonFragment = new URL(url.href);
    urlNonFragment.hash = '';
    return urlNonFragment;
  }

  /**
   * Process a JSON reference object and possibly replace the node
   * as per the replacement rules outlined in README.me
   * @param refObject a JSON Reference object
   * @param jsonKeys the path to this JSON reference in the containing API document
   * @param ancestry the chain of ancestor objects.
   */
  private async refResolvingVisitor(refObject: RefObject, nav: JsonNavigation): Promise<JsonItem> {
    const ref = refObject['$ref'] as string;
    // console.log(`seen $ref ${ref} at path ${nav.toJsonPointer()}`);
    if (ref.startsWith('#')) {
      return refObject;
    }
    const replacementRef = this.replacementForRef(ref);
    if (replacementRef) {
      refObject['$ref'] = replacementRef;
      return refObject;
    }
    // below process*Replacement operations will inline content
    // that must be resolved again with a second scan in resolve()
    this.changed = true;
    const url = this.relativeUrl(ref);
    const fragment = ApiRefResolver.urlFragment(url);
    if (!fragment) {
      return await this.processFullReplacement(url, refObject, nav);
    } else if (this.componentRegex().exec(fragment)) {
      return await this.processComponentReplacement(url, refObject, nav);
    } else {
      return await this.processOtherReplacement(url, refObject, ref, nav);
    }
  }

  /**
   * Return the URL fragment part of the URL (with the `#`)
   * or `undefined` if there is no fragment.
   * @param url a URL
   * @returns the fragment string or undefined if there is no fragment
   */
  private static urlFragment(url: URL): string | undefined {
    return url.hash === '' ? undefined : url.hash;
  }

  /**
   * Construct a URL to the reference `ref` relative to a base URL.
   * @param ref a `$ref` reference path to an API element, such as
   * and absolute URL `https://host/path/to/resource.json` or a relative
   * URL such as '../alt-path/resource.yaml`
   * @param baseUrl the base URL from which a relative path is resolved.
   * If not passed, use `this.url`
   * @returns the URL of the referenced API object
   */
  private relativeUrl(ref: string, baseUrl?: string) {
    if (ref.startsWith('http:') || ref.startsWith('http:')) {
      return new URL(ref);
    }
    const relUrl = new URL(ref, baseUrl ?? this.url.href);
    return relUrl;
  }

  /**
   * Process a JSON API document, updating all of its non-local `$ref` objects
   * be relative to the document URL where we read the document.
   * For example, consider `/path/to/apis/api-a/api.yaml` which has a `{ $ref: "../models/b.yaml#/components/schemas/thing" }
   * and `b.yaml` contains `{ $ref: "./c.yaml#/components/schemas/anotherThing" }`,
   * when we resolve the $ref in `a.yaml` and load `../models/b.yaml`
   * the reference from `b.yaml` must be changed
   * to `../c.yaml#/components/schemas/anotherThing` so that it is a correct `$ref` in the
   * context of `a.yaml`.
   * @param documentUrl the normalized URL of the  document being scanned, such as `'file://path/to/apis/models/b.yaml'`
   * in the example.
   * @param api An API object that was read from `url`
   */
  private async rewriteExternalRefs(documentUrl: URL, api: ApiObject) {
    const nonFragmentUrl = ApiRefResolver.urlNonFragment(documentUrl);
    const refRewriteVisitor = async (node: RefObject): Promise<Node> => {
      // TODO: fix this to continue to use relative URLs, not absolute URLs.
      const refNormalizedUrl = new URL(node.$ref, nonFragmentUrl);
      node.$ref = refNormalizedUrl.href;
      return node;
    };
    await visitRefObjects(api, refRewriteVisitor);
  }

  /**
   * Process a JSON document, updating all of its '#/....' local `$ref` objects  to
   * the location it was embedded in the target ApAPI document.
   * @param api A JSON object that was read from a URL or file
   * @param nav Points to where we are in the containing API document.
   * We extract a fragment from this and insert that as a prefix in the
   * local REF urls. For example, if `nav` is at `/paths/~1health/get`
   * we will insert `/paths/~1health/get` before any `#/...` `$ref` objects.
   */
  private async rewriteLocalRefsWithPrefix(api: ApiObject, nav: JsonNavigation) {
    const prefix = nav.asFragment();
    const refRewriteVisitor = async (node: RefObject): Promise<Node> => {
      const ref = node.$ref;
      if (ref.startsWith('#')) {
        node.$ref = `${prefix}/${ref.substring(1)}`;
      }
      return node;
    };
    await visitRefObjects(api, refRewriteVisitor);
  }

  /**
   * @returns A new `RegExp` which only matches an API component relative-uri fragment `#/components/<section>/<componentName>`
   * We create a new RegEx each time to allow safe re-entrant and RegEx match state.
   */
  private componentRegex() {
    return /^#\/components\/\w+\/[^/]+$/;
  }

  /**
   * Check if the inlined component already exists.
   * If it exists and it was resolved from a different URL, then:
   *   * if the component conflictStrategy in the option is `error`, throw an error
   *   * if the policy is `rename`, change the name by adding a unique suffix
   * Also create the components object and components section (componentKeys[1])
   * object if they do not exist on `this.apiObject`.
   * @param componentKeys
   * @param urlNoFragment
   * @returns
   */
  private checkComponentConflict(componentKeys: JsonKey[], urlNoFragment: URL) {
    assert(componentKeys[0] === 'components');
    const existing = this.apiDocument?.[componentKeys[0]]?.[componentKeys[1]]?.[componentKeys[2]];
    if (!existing) {
      return false;
    }
    const resolvedFrom = existing['x-resolved-from'];
    const sameResolution = resolvedFrom === urlNoFragment.href;
    if (!sameResolution && this.options?.conflictStrategy === 'error') {
      throw new Error(`Cannot embed component `);
    }
    if (!this.apiDocument['components']) {
      this.apiDocument['components'] = {};
    }
    if (!this.apiDocument['components'][componentKeys[1]]) {
      this.apiDocument['components'][componentKeys[1]] = {};
    }
    // Apply component rename conflict strategy.
    const components = this.apiDocument['components'];
    let candidateName = componentKeys[2];
    let suffix = 0;
    while (components.hasOwnProperty(candidateName)) {
      suffix = suffix + 1;
      candidateName = `${componentKeys[2]}${suffix}`;
    }
    componentKeys[2] = candidateName;
  }

  /**
   * Merged the `$ref` object with the API object read from the URL.
   * For example, when resolving the reference in the following:
   *
   * ```
   * { components: {
   *     responses: {
   *       '422':
   *         description: "Describes the error",
   *         $ref: "#/components/schemas/problemResponse"
   *     }
   *   }
   * }
   * ```
   *
   * `refObject` is the `{ description: "...", $ref: "#/components/schemas/problemResponse" }` object.
   * Note that we can't simply _replace_ the entire `$ref` object with the API object at the URL;
   * that would lose the "description".
   * Instead, we delete the `$ref` from the `refObject` with the read API document,
   * then merge in any additional properties from the original `refObject` into the API document
   * (if it is an object).
   *
   * @param refObject a `$ref` object
   * @param apiDocument the API document read from the `url`
   * @param url the URL where the API document was read from
   */
  mergeRefObject(refObject: RefObject, apiDocument: ApiObject, url: URL) {
    if (typeof apiDocument !== 'object') {
      return;
    }
    // It may be an array or even a primitive... unlikely, but possible.
    const refProperties = { ...refObject };
    delete refProperties.$ref;
    // matching properties from refProperties will override those from apiDocument:
    const merged = { ...apiDocument, ...refProperties };
    // TODO: use options to define these tags
    merged['x-resolved-from'] = url.href;
    merged['x-resolved-at'] = this.dateTime;
    merged['x__resolved__'] = true; // this is a flag for RefVisitor.visitRefObjects
  }

  /**
   * Inline the content for a `{ $ref: "http://path/to/resource#/components/section/componentName"}`
   * or `{ $ref: "../path/to/resource#/components/section/componentName"}` where
   * just a component from an API is referenced.
   * For example,
   *
   * ```
   * paths:
   *   /thing:
   *     post:
   *       operationId: createThing
   *       requestBody:
   *         description: A new thing.
   *         content:
   *             application/json:
   *               schema:
   *                 $ref: '../api-a/api.yaml#/components/schemas/thing'
   * components:
   *   securitySchemes:
   *     apiKey:
   *       $ref: '../api-a/api.yaml#/components/securitySchemes/apiKey'
   * ```
   * In the first case (`$ref: '../api-a/api.yaml#/components/schemas/thing'`), we
   * add the schema component `thing` from `../api-a/api.yaml`
   * to this API's `components/schemas` object, and replace the remote `$ref` object
   * with a local reference, $ref: '#/components/schemas/thing'.
   *
   * If there is a name conflict (i.e. the component `thing` already exists
   * and it came from a _different_ normalized URL), then apply the `conflictStrategy` from
   * the `options`.
   *
   * In the second place (a reference directly in a component),  simply
   * replace the `$ref` object (the `apiKey` security scheme) with the corresponding referenced object directly.
   *
   * The result of processing both component `#ref` objects is:
   * ```
   * paths:
   *   /thing:
   *     post:
   *       operationId: createThing
   *       requestBody:
   *         description: A new thing.
   *         content:
   *             application/json:
   *               schema:
   *                 $ref: '#/components/schemas/thing'
   * components:
   *   securitySchemes:
   *     apiKey:
   *       type: apiKey
   *       name: API-Key
   *       in: header
   *       description: 'API Key based client identification.'
   *       $ref: '../api-a/api.yaml#/components/securitySchemes/apiKey'
   *   schemas:
   *     thing:
   *       title: Thing
   *       description: A Thing!
   *       type: object
   *       ...
   * ```
   *
   * Before the content is merged into the current API document, update base URL of
   * all the `$ref` objects within the referenced API document.
   *
   * @param normalizedRefUrl the URL in the `$ref` object after normalizing it against the URL of the current target API document
   * @param refObject the `$ref` object
   * @param nav The location of the `$ref` object in the target API document
   * @returns the updated JSON item (usually an object, but may be an array or primitive)
   */
  private async processComponentReplacement(
    normalizedRefUrl: URL,
    refObject: RefObject,
    nav: JsonNavigation,
  ): Promise<JsonItem> {
    assert(nav);
    assert(normalizedRefUrl.hash);
    assert(this.componentRegex().exec(normalizedRefUrl.hash));
    const reference: string = normalizedRefUrl.href;
    const seen = this.replacementForRef(reference);
    if (seen) {
      refObject.$ref = seen;
      return refObject;
    }
    const urlNoFragment = ApiRefResolver.urlNonFragment(normalizedRefUrl);
    const { api, item } = await this.api(urlNoFragment);
    const baseUrl = new URL(urlNoFragment.href, this.url);
    await this.rewriteExternalRefs(baseUrl, api);
    let result: JsonItem = api;
    if (nav.isAtComponent()) {
      const componentKeys = JsonNavigation.asKeys(normalizedRefUrl.hash);
      const component = item;
      this.checkComponentConflict(componentKeys, urlNoFragment); // may rename the component
      this.apiDocument['components'][componentKeys[1]][componentKeys[2]] = component;
      refObject.$ref = JsonNavigation.asFragment(componentKeys, true);
      result = refObject;
    } else {
      const componentKeys = JsonNavigation.asKeys(normalizedRefUrl.hash);
      const component = api?.[componentKeys[0]]?.[componentKeys[1]]?.[componentKeys[2]];
      result = component;
    }
    // remember the mapping from the original `$ref` to the new inline
    // location of the current object from the target API document navigation
    const resolvedRef = nav.asFragment();
    this.rememberReplacementForRef(reference, resolvedRef);
    return result;
  }

  /**
   * Inline the content for a `{ $ref: "http://path/to/resource"}`
   * or `{ $ref: "../path/to/resource"}` where the entire
   * file contents are embedded at the place of the `$ref` object
   * indicated by the `nav` location. For example,
   * ```
   * components:
   *   schemas:
   *     range:
   *       $ref: ../schemas/percentageRange.yaml
   * ```
   * the current `nav` location of the `$ref` object is `/components/schemas/range`
   * Fetch the API document from the location, then replace
   * the `$ref` object with the API contents, then update
   * all the `{ $ref` : "#/path" } objects within that object, adjusting
   * the path to account for the new location. For example,
   * if `percentageRange.yaml` contains
   *
   * ```
   * properties:
   *   low:
   *     description: The lower-bound of the percentage range.
   *     $ref: 'percentage.yaml'
   *   high:
   *     description: The lower-bound of the percentage range.
   *     $ref: '#/properties/low'
   * ```
   *
   * we adjust all the `$ref` objects , yielding corrected
   * locations
   *
   * ```
   * components:
   *   schemas:
   *     range:
   *       type: object
   *       description: A range of low and high percentages.
   *       properties:
   *         low:
   *           description: The lower-bound of the percentage range.
   *           $ref: '../schemas/percentage.yaml'
   *         high:
   *           description: The lower-bound of the percentage range.
   *           $ref: '#/components/schemas/range/properties/low'
   *       ```
   * The first `$ref` is relative to the the current API;
   * the second `$ref` is updated with the prefix of the current `nav` location.
   * @param normalizedRefUrl the URL in the `$ref` object after normalizing it against the URL of the current target API document
   * @param refObject the `$ref` object
   * @param nav The location of the `$ref` object in the target API document
   * @returns the updated JSON item (usually an object, but may be an array or primitive)
   */
  private async processFullReplacement(
    normalizedRefUrl: URL,
    refObject: RefObject,
    nav: JsonNavigation,
  ): Promise<JsonItem> {
    assert(normalizedRefUrl.hash === '');
    const reference: string = normalizedRefUrl.href;
    const seen = this.replacementForRef(reference);
    if (seen) {
      refObject.$ref = seen;
      return refObject;
    }
    const { api } = await this.api(normalizedRefUrl); // no fragment or item
    // remember the mapping from the original `$ref` to the new inline
    // location of the current object from the target API document navigation
    const resolvedRef = nav.asFragment();
    this.rememberReplacementForRef(reference, resolvedRef);
    await this.rewriteLocalRefsWithPrefix(api, nav);
    await this.rewriteExternalRefs(normalizedRefUrl, api);
    this.mergeRefObject(refObject, api, normalizedRefUrl);
    return api;
  }

  /**
   * Inline the content for a `{ $ref: "path/to/resource#/path/to/non-component"}`
   * where the `$ref` URL contains a non-empty `#` fragment
   * (Use `processFullReplacement` if the fragment is empty,
   * and use `processComponentReplacement` if the fragment is
   * of the form `/components/section/componentName`.)
   * For example,
   *
   * ```
   * paths:
   *   /health:
   *     $ref: '../root.yaml#/paths/~1health/get'
   * ```
   *
   * We read the APi document (`../root.yaml` in this case),
   * scan it to redirect any $ref in it so that they are relative
   * to the current API document, then extract the API element
   * at the fragment and return it.
   *
   * If the `GET /heath` operation in root.yaml
   *
   * ```
   * /health:
   *   get:
   *     operationId: apiHealth
   *     description: Return API Health
   *     tags:
   *       - Health
   *     responses:
   *       '200':
   *         description: OK. The API is alive and active.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/health'
   * ```
   *
   * the result will be
   *
   * ```
   * /health:
   *   get:
   *     operationId: apiHealth
   *     description: Return API Health
   *     tags:
   *       - Health
   *     responses:
   *       '200':
   *         description: OK. The API is alive and active.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#../root.yaml/components/schemas/health'
   * ```
   *
   * Note that the `$ref` to the `health` schema, which was a local `#/...` reference
   * within `../root.yaml`,  was re-written as a remote `$ref` to the `health`
   * schema in that document, because `health` does not (yet) exist in the target
   * API document. However, that `$ref` will get resolved in a later stage.
   *
   * @param normalizedRefUrl the URL in the `$ref` object after normalizing it against the URL of the current target API document
   * @param refObject the `$ref` object
   * @param nav The location of the `$ref` object in the target API document
   * @returns the updated JSON item (usually an object, but may be an array or primitive)
   */
  private async processOtherReplacement(
    normalizedRefUrl: URL,
    refObject: RefObject,
    reference: string,
    nav: JsonNavigation,
  ): Promise<JsonItem> {
    assert(normalizedRefUrl.hash);
    assert(!this.componentRegex().exec(normalizedRefUrl.hash));
    const seen = this.replacementForRef(reference);
    if (seen) {
      refObject.$ref = seen;
      return refObject;
    }
    const { api, item } = await this.api(normalizedRefUrl);
    const urlNoFragment = ApiRefResolver.urlNonFragment(normalizedRefUrl);
    const baseUrl = new URL(urlNoFragment.href, this.url);
    await this.rewriteExternalRefs(baseUrl, api);
    await this.rewriteLocalRefsWithPrefix(api, nav);
    const resolvedRef = normalizedRefUrl.hash;
    this.rememberReplacementForRef(reference, resolvedRef);
    // TODO: Add x-resolved-from tags to item
    return item; 
  }
}
