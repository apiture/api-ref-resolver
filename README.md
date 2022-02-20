# @apiture/api-ref-resolver

## Purpose

`api-ref-resolver` resolves multi-file API definition documents by replacing
external `{$ref: "uri"}` [JSON Reference](https://datatracker.ietf.org/doc/html/draft-pbryan-zyp-json-ref-03)
objects with the object referenced at the `uri`. The `uri`
may be a file-path (or a URL) with an optional `#` [JSON Pointer fragment](https://datatracker.ietf.org/doc/html/draft-ietf-appsawg-json-pointer-04). 
This tool does not enforce JSON Reference strictness; that is, the `$ref` member 
may have siblings.

Below, a `normalized-path` is defined as the simplified
version of a file-path or URL, i.e. with `../` path elements collapsed.
The normalized path for `../a/b/c/../../d/e`  is `../a/d/e`.

There are four types of replacements:

1. local references, `{ $ref: "#/path/to/element" }`
This tool does not alter these.
2. _Component replacements_ are of the form
`{ $ref: "uri#/components/section/componentName" }` (`section` may be `schemas`,
`parameters`, `response`, or other `components`). This replacement only done for three levels; for longer JSON pointers, see #4 below.
For component replacements,
the external URI is read (if not already cached) and the named components
inserted into the target document
in side it's own components object, and the `$ref` replaced by
`{ $ref: "#/components/section/componentName" }`. 
The `ApiRefOptions.conflictPolicy` determines what to do if the component
already exists; it is either renamed with a unique numeric suffix (`rename`)
or it is an error and the entire process fails (`error`).
Note: The OpenAPI Specification requires that these paths be relative to the
path in the
`servers` object, but this tool simply uses relative references
from the source URI.)
3. _Full resource replacements_ are of the form
`{ $ref: "uri" }` with no `#` fragment. If not yet seen, the entire external file
is inserted, replacing the `$ref` object. The location is
remembered so that any duplicate references to the normalized
path are replaced with a local `{ $ref: #/location/to/resource }'
4. _Other embedded objects_
When referencing non-component objects, such as 
`{ $ref: "file-path#paths/~api~path/get" } to include the `get` operation at 
the OpenAPI path /api/path the external
object

After embedding an external object from `uri`, the tool will also resolve any
`$ref` objects in it, relative to the path that the object was read from.
Any `{ $ref: "#/..."}` objects are converted to `{ $ref: "normalized-path#/..."}`