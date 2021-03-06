/**
 * Captures a JSON document and the navigation path
 * (set of keys) used when recursively walking the JSON
 * document.
 */

import { strict as assert } from 'assert';
import * as jsonPointer from 'json-pointer';
import type { Node } from './RefVisitor';
import { ApiRefResolver } from './ApiRefResolver';

/**
 * Represents a JSON object or JSON array
 */
export type JsonNode = Node;

/**
 * `JsonKey` is an element of a JsonNavigation _path_.
 * For example in
 * ```
 * { a: { b : [ 0, 1, { c: "here"}]}}
 * ```
 * the value `"here"` is at the path defined by
 * the `JsonKey` values
 * ```
 * [ "a", "b", 2, "c" ]
 * ```
 */
export type JsonKey = string | number;

/**
 * Represents a value inside a JSON document
 */
export type JsonItem = object | [] | string | boolean | number | null;

/**
 * Path (keys) to an item in a JSON document
 */

export class JsonNavigation {
  private document: JsonNode;
  private keys: JsonKey[];
  constructor(document: JsonNode, ...keys: JsonKey[]) {
    assert(document);
    assert(typeof document === 'object' || Array.isArray(document));
    this.document = document;
    if (keys) {
      this.keys = [...keys];
    } else {
      this.keys = [];
    }
  }

  /**
   * Return the navigation keys
   * @returns The keys that navigate to this point in the JSON document
   */
  public path(): JsonKey[] {
    return [...this.keys];
  }

  /**
   * Return the document item at the JSON Pointer fragment.
   * @param fragment a URL fragment such as `'#/components/schemas/mySchema'`
   * @returns the item at the nested object specified by `fragment`, or `undefined` if
   * `fragment` is '' (or is falsy).
   */
  public itemAtFragment(fragment: string): JsonItem | undefined {
    if (!fragment) {
      return undefined;
    }
    const noHash = fragment.substring(1);
    const val = jsonPointer(this.document, noHash);
    // To be safe, we clone objects so we do not end up with YAML &ref_0/*ref_0
    const clone = ApiRefResolver.deepClone(val);
    return clone;
  }

  /**
   * Return the document item at the JSON Pointer fragment
   * @param document A JSON object or array
   * @param fragment a URL fragment such as `'#/components/schemas/mySchema'`
   * @returns the item at the nested object specified by `fragment`, or `undefined` if
   * `fragment` is '' (or is falsy).
   */
  public static itemAtFragment(document: JsonNode, fragment: string): JsonItem | undefined {
    return new JsonNavigation(document).itemAtFragment(fragment);
  }

  /**
   * Convert the current instance's navigation path to a JSON Pointer URL fragment.
   * For example, if the current path is `[ 'paths', '/things', 'post', 'responses', 1]`,
   * return `#/paths/~1things/post/responses/1`
   * @return a stringified URL fragment path
   */
  public asFragment(): string {
    const fragment = jsonPointer.compile(this.keys);
    return `#${fragment}`;
  }

  /**
   * Convert an array of keys to a JSON Pointer URL fragment.
   * For example, for the keys `[ 'paths', '/things', 'post', 'responses', 1]`,
   * return `#/paths/~1things/post/responses/1`
   * @param keys an array of JSON keys
   * @return a stringified URL fragment path
   */
  public static asFragment(keys: JsonKey[], withHash = false): string {
    const fragment = jsonPointer.compile(keys);
    return withHash ? `#${fragment}` : fragment;
  }

  /**
   * Parse a URL fragment as an array of keys
   * @param fragment the URL fragment
   * such as `#/paths/~1things/post/responses/1`.
   * @return An array of keys, such as `[ 'paths', '/things', 'post', 'responses', 1]`
   */
  public static asKeys(fragment: string): JsonKey[] {
    const keys = jsonPointer.parse(fragment.substring(1)).map((key) => {
      if (/^\d+$/.exec(key)) {
        return parseInt(key);
      }
      return key;
    });
    return keys as JsonKey[];
  }

  /**
   * @returns `true` if the current navigation is at `/components/section/componentName`
   */
  public isAtComponent(): boolean {
    return this.keys.length === 3 && this.keys[0] === 'components';
  }

  /**
   * Return the item accessed by a sequence of keys
   * @param keys a set of keys, such as ['components', 'schemas', 'mySchema']
   * @returns the item at the nested object specified by fragment
   */
  public itemAtPointer(keys: JsonKey[]): JsonItem {
    return jsonPointer(this.document, keys);
  }

  /**
   * @returns the current key in the key sequence - the name of the current JSON item
   */
  public currentKey(): JsonKey {
    return this.keys[this.keys.length - 1];
  }

  /**
   * @returns the current object in the document that this navigation
   * points to.
   */
  public lastItem(): JsonItem {
    return this.itemAtPointer(this.keys);
  }

  /**
   * Construct and return a new nav that points to the item
   * referenced by `key` within the current document location.
   * @param key the name or index of the nested item
   * @return a new JsonNavigation instance that points to the
   * same document, but appends `key` to the path.
   */
  public with(key: JsonKey) {
    const newNav = new JsonNavigation(this.document);
    newNav.keys = [...this.keys]; // make a safe copy
    newNav.keys.push(key);
    return newNav;
  }
}
