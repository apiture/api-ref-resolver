import { JsonNavigation, JsonItem } from './JsonNavigation';

/**
 * Recursively walk a JSON object and invoke a callback function
 * on each `{ "$ref" : "path" }` object found
 */

/**
 * A container: a JSON object or array - a JSON container node
 */
export type Node = object | [];

/**
 * Represents a JSON Reference object, such as
 * `{"$ref": "#/components/schemas/problemResponse" }`
 */
export interface RefObject {
  $ref: string;
}

/**
 * Function signature for the visitRefObjects callback
 */
export type RefVisitor = (node: RefObject, nav: JsonNavigation) => Promise<JsonItem>;

/**
 * Function signature for the walkObject callback
 */
export type ObjectVisitor = (node: object, nav: JsonNavigation) => Promise<JsonItem>;

export function isRef(node: Node): boolean {
  return node !== null && typeof node === 'object' && node.hasOwnProperty('$ref') && typeof (node as RefObject).$ref === 'string';
}

function isResolved(node: Node): boolean {
  // this depends on the tag being added in ApiRefResolver
  return node !== null && typeof node === 'object' && node.hasOwnProperty('x__resolved__');
}

/**
 * Walk a JSON object and apply `refCallback` when a JSON `{$ref: url }` is found
 * @param node a node in the OpenAPI document
 * @param refCallback the function to call on JSON `$ref` objects
 * @param nav tracks where we are in the original document
 * @return the modified (annotated) node
 */
export async function visitRefObjects(node: object, refCallback: RefVisitor, nav?: JsonNavigation): Promise<JsonItem> {
  const objectVisitor = async (node: object, nav: JsonNavigation): Promise<JsonItem> => {
    if (isRef(node)) {
      if (isResolved(node)) {
        return node;
      }
      return await refCallback(node as RefObject, nav);
    }
    return node;
  };
  return walkObject(node, objectVisitor, nav);
}

/**
 * Walk a JSON object or array and apply objectCallback when a JSON object is found
 * @param node a node in the OpenAPI document
 * @param objectCallback the function to call on JSON objects
 * @param nav tracks where we are in the original document
 * @return the modified (annotated) node
 */
export async function walkObject(node: object, objectCallback: ObjectVisitor, nav?: JsonNavigation): Promise<JsonItem> {
  return walkObj(node, nav || new JsonNavigation(node));

  async function walkObj(node: object, location: JsonNavigation): Promise<JsonItem> {
    const object = objectCallback(node, location);
    if (object !== null && typeof object === 'object') {
      const keys = [...Object.keys(node)]; // make copy since this code may re-enter objects
      for (const key of keys) {
        const val = node[key];
        if (Array.isArray(val)) {
          node[key] = await walkArray(val as [], location.with(key));
        } else if (val !== null && typeof val === 'object') {
          node[key] = await walkObj(val, location.with(key));
        }
      }
    }
    return object;
  }

  async function walkArray(a: [], nav: JsonNavigation): Promise<[]> {
    const array = a as Node;
    for (let index = 0; index < a.length; index += 1) {
      const val = array[index] as Node;
      if (val !== null && typeof val === 'object') {
        array[index] = (await walkObj(val, nav.with(index))) as object;
      } else if (Array.isArray(val)) {
        array[index] = (await walkArray(val as [], nav.with(index))) as [];
      }
    }
    return a;
  }
}
