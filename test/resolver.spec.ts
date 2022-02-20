"use strict";
const yaml = require("js-yaml");
const fs = require("fs");
const { describe, expect, test, xit } = require("@jest/globals");
import {ApiRefResolver } from "../src/resolver";

describe("resolver test suite", () => {
    test("resolve scans multi-file OpenAPI document", (done) => {
        const sourceFileName = "test/data/api-b/api.yaml";
        const sourceText = fs.readFileSync(sourceFileName, "utf8");
        const openApiObject = yaml.load(sourceText);
        const options = {};

        const resolver = new ApiRefResolver();
        resolver
            .resolve(sourceFileName, openApiObject, options)
            .then( (result) => {
                const resolved = result.api as any;
                expect(resolved).toBeDefined();
                done();
            })
            .catch(function (ex) {
                console.error(ex.message);
                done(ex);
            });
        });

    xit("resolve components from multi-file OpenAPI document", (done) => {
        const sourceFileName = "test/data/api-b/api.yaml";
        const sourceText = fs.readFileSync(sourceFileName, "utf8");
        const openApiObject = yaml.load(sourceText);
        const options = {};

        const resolver = new ApiRefResolver();
        resolver
            .resolve(sourceFileName, openApiObject, options)
            .then( (result) => {
                const resolved = result.api as any;
                const schemas = Object.keys(openApiObject.components.schemas);
                schemas.forEach(schemaName => {
                    const schema = resolved.components.schemas[schemaName];
                    expect(schema).toBeDefined();
                    expect(schema.$ref).toBeFalsy();
                    expect(schema.title).toBeTruthy();
                    expect(schema.type).toBeTruthy();
                    expect(schema.description).toBeTruthy();
                }); 
                const responses = Object.keys(openApiObject.components.responses);
                responses.forEach(responseCode => {
                    const response = resolved.components.responses[responseCode];
                    expect(response).toBeDefined();
                    expect(response.$ref).toBeFalsy();
                });
                const parameters = Object.keys(openApiObject.components.parameters);
                parameters.forEach(parameterName => {
                    const parameter = resolved.components.parameters[parameterName];
                    expect(parameter).toBeDefined();
                    expect(parameter.$ref).toBeFalsy();
                });
                const post = openApiObject.paths['/thing'].post;
                expect(post).toBeDefined();
                const requestBodySchema = post.requestBody.content['application/json'].schema;
                expect(requestBodySchema).toBeDefined();
                expect(requestBodySchema.$ref).toBeDefined();
                expect(Object.keys(requestBodySchema)).toEqual(['$ref']);
                const response400 = post.responses[400];
                expect(response400.$ref).toBeDefined();
                expect(Object.keys(response400)).toEqual(['$ref']);
                done();
            })
            .catch(function (ex) {
                console.error(ex.message);
                done(ex);
            });
    });
});
