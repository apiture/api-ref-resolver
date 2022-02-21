import * as jsonPointer from 'json-pointer';

/**
 * JsonKey is a an element of a JsonKeys path.
 * For example in { a: { b : [ 0, 1, { c: "here"}]}}
 * the value "here" is at the path defined by
 * the JsonKeys `[ "a", "b", 2, and "c" ]`.
 */
export type JsonKey = string | number;

/**
 * Path (keys) to an item in a JSON document
 */
export class JsonKeys {
  private readonly path: JsonKey[] = [];

  public constructor(...elements: JsonKey[]) {
    this.path = [...elements];
  }

  /**
   * Construct an return a new path that is built on this path and has
   * the new path elt
   */
  with(pathElt: JsonKey): JsonKeys {
    const newPath = new JsonKeys(...this.path.concat([pathElt]));
    return newPath;
  }

  /**
   * Convert a JsonKeys path to a string
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