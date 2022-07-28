# @apiture/api-ref-resolver

`api-ref-resolver` resolves multi-file API definition documents by replacing
external `{$ref: "uri"}` [JSON Reference](https://datatracker.ietf.org/doc/html/draft-pbryan-zyp-json-ref-03)
objects with the object referenced at the `uri`.
The `uri` may be a file-path or a URL with an optional
`#` [JSON Pointer fragment](https://datatracker.ietf.org/doc/html/draft-ietf-appsawg-json-pointer-04).

For example, if `components.yaml` contains: <!-- content from: test/data/readme-example/component.yaml -->

```yaml
paths:
  '/health':
    get:
      operationId: apiHealth
      description: Return API Health
      tags:
        - Health
      responses:
        '200':
          description: OK. The API is alive and active.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/health'
components:
  parameters:
    idempotencyKeyHeaderParam:
      name: Idempotency-Key
      description: Idempotency Key to guarantee client requests and not processed multiple times.
      in: header
      schema:
        type: string
  schemas:
    health:
      title: API Health
      description: API Health response
      type: object
      properties:
        status:
          description: The API status.
          type: string
          enum:
            - pass
            - fail
            - warn
```

and `api.yaml` contains <!-- content from: test/data/readme-example/api.yaml -->

```yaml
paths:
  /health:
    get:
      $ref: 'components.yaml#/paths/~1health/get'
  /thing:
    parameters:
      - $ref: 'components.yaml#/components/parameters/idempotencyKeyHeaderParam'
```

then running

```bash
api-ref-resolver -i api.yaml -o resolved-api.yaml
```

will yield the following in `resolved-api.yaml`:

<!-- generate resolved-api.yaml with test/data/readme-example/generate-example.sh
     content from: test/data/readme-example/resolved-api.yaml -->
```yaml
paths:
  /health:
    get:
      operationId: apiHealth
      description: Return API Health
      tags:
        - Health
      responses:
        '200':
          description: OK. The API is alive and active.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/health'
      x-resolved-from: >-
        components.yaml#/paths/~1health/get
  /thing:
    parameters:
      - $ref: '#/components/parameters/idempotencyKeyHeaderParam'
components:
  parameters:
    idempotencyKeyHeaderParam:
      name: Idempotency-Key
      description: >-
        Idempotency Key to guarantee client requests and not processed multiple
        times.
      in: header
      schema:
        type: string
      x-resolved-from: >-
        components.yaml#/components/parameters/idempotencyKeyHeaderParam
  schemas:
    health:
      title: API Health
      description: API Health response
      type: object
      properties:
        status:
          description: The API status.
          type: string
          enum:
            - pass
            - fail
            - warn
      x-resolved-from: >-
        components.yaml#/components/schemas/health
x-resolved-from: >-
  api.yaml
x-resolved-at: '2022-03-11T16:27:59.365Z'

```

The tool handles chains of JSON references (i.e. `a.yaml` references components from `b.yaml` which references components from `c.yaml`) as
well as direct or indirect cycles (component `A` references component `B` which references component `A`).

Unlike other generic `$ref` resolvers ([1](https://github.com/Mermade/oas-kit/tree/main/packages/oas-resolver), [2](https://www.npmjs.com/package/@stoplight/json-ref-resolver), [3](https://github.com/APIDevTools/json-schema-ref-parser)),
`api-ref-resolver` treats `components` references specially.
It understands reusable `components/section/componentName` objects at the top-level of an API definition, such as `#/components/schemas/schemaName`, and attempts to
maintain those component structures; see [Notes](#notes) below.
Otherwise, it is specification agnostic and works with either
[OpenAPI](https://www.openapis.org/) specification or [AsyncAPI](https://www.asyncapi.com/) specification.

This tool does _not_ enforce JSON Reference strictness; that is, the `$ref` member may have siblings, as used in [OpenAPI 3.1 Reference Objects](https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.1.0.md#referenceObject).

## Use

### Command Line Interface

```bash
api-ref-resolver --input api.yaml --output resolved-api.yaml
# arr is also defined a shortcut command for api-ref-resolver
arr --input api.yaml --output resolved-api.yaml
arr -i  api.yaml | some-other-pipeline >| resolved-api.yaml
```

Command line options:

<!-- run `api-ref-resolver --help` to generate this help -->
```text
Usage: api-ref-resolver [options]

Options:
  -V, --version               output the version number
  -i, --input <input-file>    An openapi.yaml or asyncapi.yaml file name or URL. Defaults to "api.yaml"
  -n, --no-markers            Do not add x-resolved-from and x-resolved-at markers
  -o, --output <output-file>  The output file, defaults to stdout if omitted
  -f, --format [yaml|json]    Output format for stdout if no --output option is used; default to yaml
  -v, --verbose               Verbose output
  -h, --help                  display help for command
```

### Node.js

```javascript
import { ApiRefResolver } from '@apiture/api-ref-resolver';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

const sourceFileName = 'apy.yaml'
const outputFileName = 'resolved-api.yaml'

const resolver = new ApiRefResolver(sourceFileName);
const options: ApiRefOptions = {
  verbose: false,
  conflictStrategy: 'error', // 'error' | 'rename' | 'ignore';
  outputFormat: 'yaml'       // 'yaml' | 'json'
};
options.verbose = opts.verbose;
resolver
  .resolve(options)
  .then((resolved) => {
    fs.writeFileSync(outputFileName, yaml.dump(resolved.api), 'utf8');
  })
  .catch((ex) => {
    console.error(ex.message);
    process.exit(1);
  });
```

or with `async`/`await`:

```javascript
// ..initialize as above, but inside an async function:
try {
  const resolved = await resolve(options);
  fs.writeFileSync(outputFileName, yaml.dump(resolved.api), 'utf8');
} catch (e) {
  // handle error e
}
```

## Notes

Below, a _normalized path_ is defined as the simplified
version of a file-path or URL, i.e. with `../` path elements collapsed.
The normalized path for `../a/b/c/../../d/e`  is `../a/d/e`.

Local references that begin with `#`, such as `{ $ref: "#/path/to/element" }`,
are left as-is.

There are three types of replacements:
Component Replacements,
Full resource replacements,
and Other embedded objects.

### Component replacements

_Component replacements_ are of the form
`{ $ref: "uri#/components/section/componentName" }` (`section` may be `schemas`,
`parameters`, `response`, or any other item in `components`).
Component replacements are only done for three-level JSON Pointers; for longer JSON pointers, see #4 below.

If the containing $ref object is at `/components/section/componentName0`, it does not contain any other keys, and
`componentName0` equals `componentName`, the entire referenced object is inserted
in place of the original `$ref` object and the mapping `uri#/components/section/componentName` &rArr; `#/components/section/componentName`
is remembered.

This is useful to reuse security schemes in OpenAPI 3.1, which are reference by names instead of a `$ref`.
For example, if `common.yaml` contains the definition of the `apiKey` security schema:

```yaml
components:
  securitySchemes:
    apiKey:
      type: apiKey
      name: API-Key
      in: header
      description: 'API Key based client identification.'
```

then other API source files can reference this via

```yaml
paths:
  '/some/path':
    get:
      security:
        apiKey: []
components:
  securitySchemes:
    apiKey:
      $ref: '../common.yaml#/components/securitySchemes/apiKey'
```

This tool will replace the `$ref` definition of `apiKey`
with the one from `common.yaml`:

```yaml
paths:
  '/some/path':
    get:
      security:
        apiKey: []
components:
  securitySchemes:
      type: apiKey
      name: API-Key
      in: header
      description: 'API Key based client identification.'
      x-resolved-from: common.yaml#/components/securitySchemes/apiKey
```

In a more complicated case (where the `$ref` contains other properties,
preventing a simple replacement),
the content at the external URI is read and the new named component is
inserted into the target document's components object. The non-local `$ref` ( `../common.yaml#/components/responses/404` in this case) replaced by
a local ref, such as `{ $ref: "#/components/responses/404" }`.

For example, if an API has several operations that can return a 404 when a thing
is not found, it may define the reusable component response
with a clean description of the problem:

```yaml

paths:
  /thing/{thingId}:
    get:
      ...
      responses:
        '404':
          $ref: '#/components/responses/404Thing'
    put:
      ...
      responses:
        '404':
          $ref: '#/components/responses/404Thing'
    patch:
      ...
      responses:
        '404':
          $ref: '#/components/responses/404Thing'
components:
  responses:
    '404Thing':
      description: Thing not found at /thing/{thingId}.
      $ref: 'common.yaml#/components/responses/404'
```

The tool will inline the `404` response from `common.yaml` as a component,
then replace the remote `$ref` inside thr `404Thing` response with a reference to the local, inlined `404`:

```yaml
components:
  responses:
    '404':
      description: Not found. There is no such resource at the request URL.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/problemResponse'
      x-resolved-from: common.yaml#/components/responses/404
    404Thing:
      description: Thing not found at /thing/{thingId}.
      $ref: '#/components/responses/404'
```

The `ApiRefOptions.conflictPolicy` determines what to do if the `componentName`
already exists in the target document:

* it is either renamed with a unique numeric suffix (`rename`);
* it is an error and the entire process fails (`error`)
* the conflict is ignored (`ignore`).

Note: The OpenAPI Specification requires that these paths be relative to the
path in the
`servers` object, but this tool simply uses relative references
from the source URI.

### Full resource replacements

_Full resource replacements_ are of the form
`{ $ref: "uri" }` with no `#` fragment. If not yet seen, the entire external file
is inserted, replacing the `$ref` object. The location is
remembered so that any duplicate references to the normalized
path are replaced with a local `{ $ref: #/location/of/resolved/resource }`.
This is _only_ done if the `$ref` is the _only_ key in the object.

### Other embedded objects

When referencing non-component objects, such as
`{ $ref: "components.yaml#/paths/~1health/get" }` to include the `get` operation at
the OpenAPI path `/health` the operation object in `components.yaml`.

After embedding an external object from `uri`, the tool will also rewrite any
`$ref` objects within it, relative to the path that the object was read from.
Any `{ $ref: "#/..."}` objects are converted to `{ $ref: "normalized-path#/..."}`.

### To Do

This tool does not yet merge non-`$ref` content from API files. For example, if
one file has a `$ref` to an operation in another file, this tool
does not pull in API elements from the referenced file, such as the
`tags` and `security` requirements of the referenced operation.
