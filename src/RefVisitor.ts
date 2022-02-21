import { Ancestry } from './Ancestry';
import { JsonKeys } from './JsonKeys';

/**
 * Recursively walk a JSON object and invoke a callback function
 * on each `{ "$ref" : "path" }` object found
 */

// eslint-disable-next-line no-unused-vars
export type RefVisitor = (node: Node, path: JsonKeys, ancestry: Ancestry) => Promise<Node>;

/**
 * A container: a JSON object or array - a container node
 */
export type Node = object | [];

/**
 * Walk a JSON object or array and apply f when a $ref is found
 * @param node a node in the OpenAPI document
 * @param path the path to this node, such as `[ 'components', 'schemas', 'mySchema', 'allOf', 0 ]`
 * @param ancestry the parent objects, one per path element.
 * @param f the function to call on found reference objects
 * @return the modified (annotated) node
 */
export function walkObject(node: object, path: JsonKeys, ancestry: Ancestry, f: RefVisitor): object {
  if (isRef(node)) {
    f(node, path, ancestry);
  }
  const modNode: object = node;
  const keys = [...Object.keys(node)]; // make copy since this code may re-enter objects
  keys.forEach((key) => {
    let val = node[key];
    if (val !== null && val instanceof Array) {
      val = walkArray(val as [], path.with(key), ancestry.with(modNode), f);
    } else if (val !== null && typeof val === 'object') {
      val = walkObject(val, path.with(key), ancestry.with(modNode), f);
    }
    node[key] = val;
  });
  return modNode;
}

function isRef(node: Node): boolean {
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
function walkArray(a: [], path: JsonKeys, ancestry: Ancestry, f): [] {
  for (let index = 0; index < a.length; index = index + 1) {
    const val = a[index] as Node;
    const itemPath = path.with(index);
    const itemAncestry = ancestry.with(a);
    if (val !== null && typeof val === 'object') {
      const modified = walkObject(val, itemPath, itemAncestry, f) as object;
      (a as Node[])[index] = modified;
    } else if (val !== null && val instanceof Array) {
      const modified = walkArray(val as [], itemPath, itemAncestry, f) as [];
      (a as Node[])[index] = modified;
    }
  }
  return a;
}
