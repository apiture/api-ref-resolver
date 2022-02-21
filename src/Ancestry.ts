
/**
 * A container: a JSON object or array
 */
export type Ancestor = object | [];

/**
 * Ancestry is the sequence of parent and parent of parent objects/arrays.
 * For example for an OpenAPI document `api`, at the path
 * `[ 'components', 'schemas', `mySchema`, `allOf`, 0]
 * the ancestors are the objects along the way:
 * ```
 * api object
 * api.components object
 * api.components.mySchema object
 * api.components.mySchema.allOf array
 * api.components.mySchema[0] array item
 * ```
 */

export class Ancestry {
  private readonly ancestors: Ancestor[];

  constructor(...ancestors: Ancestor[]) {
    this.ancestors = [...ancestors];
  }

  /**
   * Construct a new ancestor chain with the `ancestor`
   * @param ancestor a container (object or array)
   * @returns a new Ancestor
   */
  with(ancestor: Ancestor): Ancestry {
    return new Ancestry(this.ancestors.concat([ancestor]));
  }

  /**
   * @returns the immediate parent object
   */
  parent(): Ancestor {
    return this.ancestors[this.ancestors.length - 1];
  }
}

