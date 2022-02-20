// import * as yaml from 'js-yaml';
import * as jsonPointer from 'json-pointer';

/**
 * Options for running ApiRefResolver.resolve() function
 */
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

/** ApiObject represents an OpenAPI or Async API object */
export type ApiObject = Object;

/**
 * PathElt is a an element of a JSON Path.
 * For example in { a: { b : [ 0, 1, { c: "here"}]}}
 * the value "here" is at the path [ "a", "b", 2, "c"]
 */
export type PathElt = string | number;

/** Path (keys) to an item in a JSON document */
export class Path {
  private readonly path: PathElt[] = [];
  constructor(...elements: PathElt[]) {
    this.path = [...elements];
  }

  /**
   * Construct an return a new path that is built on this path and has
   * the new path elt
   */
  with(pathElt: PathElt): Path {
    const newPath = new Path(...this.path.concat([pathElt]));
    return newPath;
  }

  /**
   * Convert a path to a string
   * @return a stringified path
   */
  toString(): string {
    return `[ ${this.path.map((item) => item.toString()).join(' . ')} ]`;
  }
  /**
   * Convert a path to a JSON Pointer string
   * @return a stringified path
   */
  toJsonPointer(): string {
    return jsonPointer.compile(this.path);
  }
}

/**
 * Ancestry is the sequence of parent and parent of parent objects/arrays
 */
export class Ancestry {
  private readonly ancestors: any[] = [];
  constructor(...ancestors: any[]) {
    this.ancestors = [...ancestors];
  }
  with(ancestor: any): Ancestry {
    return new Ancestry(this.ancestors.concat([ancestor]));
  }
}

/** The result of running resolve() */
export class ApiRefResolved {
  public api: ApiObject;
}

type RefVisitor = (node: any, path: Path, ancestry: Ancestry) => any;

function refVisitor(node: object, path: Path, ancestry: Ancestry): any {
  console.log(`seen $ref ${node['$ref']} at path ${path.toJsonPointer()}`);
}

/**
 * ApiRefResolver resolves multi-file API definition documents by replacing
 * external `{$ref: "uri"}` [JSON Reference](https://datatracker.ietf.org/doc/html/draft-pbryan-zyp-json-ref-03)
 * objects with the object referenced at the `uri`.
 */
export class ApiRefResolver {
  /** Maps normalized path names or URLs to API document objects */
  private externalFileMap: { [path: string]: ApiObject } = {};
  // private options: ApiRefOptions = {};
  async resolve(apiDocument: ApiObject, path: string, options: ApiRefOptions = {}): Promise<ApiRefResolved> {
    // this.options = options;
    this.externalFileMap[path] = apiDocument;
    this.walkObject(apiDocument, new Path(), new Ancestry(apiDocument), refVisitor);
    return { api: apiDocument };
  }

  /**
   * Walk a JSON object or array and apply f when a $ref is found
   * @param node a node in the OpenAPI document
   * @param path the path to this node.
   * @param ancestry the parent objects, one per path element.
   * @param f the function to call on found reference objects
   * @return the modified (annotated) node
   */
  private walkObject(node: Object, path: Path, ancestry: Ancestry, f: RefVisitor): Object {
    if (this.isRef(node)) {
      f(node, path, ancestry);
    }
    let modNode: Object = node;
    const keys = [...Object.keys(node)]; // make copy since this code may re-enter objects
    keys.forEach((key) => {
      let val = node[key];
      if (val !== null && val instanceof Array) {
        val = this.walkArray(val as any[], path.with(key), ancestry.with(modNode), f);
      } else if (val !== null && typeof val === 'object') {
        val = this.walkObject(val, path.with(key), ancestry.with(modNode), f);
      }
      node[key] = val;
    });
    return modNode;
  }

  isRef(node: any): boolean {
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
  private walkArray(a: any[], path: Path, ancestry: Ancestry, f): any[] {
    for (let index = 0; index < a.length; index = index + 1) {
      const val: any = a[index];
      let modified: any = val;
      const itemPath = path.with(index);
      const itemAncestry = ancestry.with(a);
      if (val !== null && typeof val === 'object') {
        modified = this.walkObject(val, itemPath, itemAncestry, f);
      } else if (val !== null && val instanceof Array) {
        modified = this.walkArray(val as any[], itemPath, itemAncestry, f);
      }
      a[index] = modified;
    }
    return a;
  }
}
