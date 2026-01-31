
export const OPENAPI_YAML = `openapi: 3.0.3
info:
  title: Web-native CAS API
  version: 0.3.2
  description: |
    Minimal API for uploading a ZIP as a fileset and retrieving objects by sha256.
    Objects are stored as Brotli-compressed bytes; object identity and ETag are sha256(raw).
servers:
  - url: http://127.0.0.1:8787
paths:
  /health:
    get:
      summary: Health check
      responses:
        '200':
          description: OK
          content:
            text/plain:
              schema:
                type: string
  /filesets:
    post:
      summary: Upload a ZIP archive and create a fileset
      description: |
        Send the ZIP bytes as the request body with Content-Type: application/zip.
        The server streams entries, stores each file as a CAS object, then finalizes using Central Directory.
      parameters:
        - name: update_ref
          in: query
          required: false
          schema:
            type: string
          description: Ref name to update (default: latest). Use empty to disable.
      requestBody:
        required: true
        content:
          application/zip:
            schema:
              type: string
              format: binary
      responses:
        '201':
          description: Created
          headers:
            Location:
              schema:
                type: string
              description: Fileset URL
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FilesetCreateResponse'
            text/plain:
              schema:
                type: string
        '415':
          description: Unsupported Media Type
  /filesets/{filesetId}:
    get:
      summary: Get a fileset manifest
      parameters:
        - name: filesetId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          headers:
            ETag:
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FilesetManifest'
        '404':
          description: Not found
  /objects/{sha256}:
    get:
      summary: Get an object by sha256
      description: |
        Returns Brotli bytes when the client accepts br (Accept-Encoding includes br).
        ETag is always sha256(raw). Range is not supported.
      parameters:
        - name: sha256
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          headers:
            Content-Encoding:
              schema:
                type: string
              example: br
            ETag:
              schema:
                type: string
          content:
            application/octet-stream:
              schema:
                type: string
                format: binary
        '304':
          description: Not Modified
        '406':
          description: Not Acceptable (client does not accept br)
        '404':
          description: Not found
  /refs/{name}:
    get:
      summary: Get a ref value
      parameters:
        - name: name
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
          content:
            text/plain:
              schema:
                type: string
        '404':
          description: Not found
components:
  schemas:
    FilesetCreateResponse:
      type: object
      required: [filesetId, manifest]
      properties:
        filesetId:
          type: string
        updatedRef:
          type: string
          nullable: true
        manifest:
          $ref: '#/components/schemas/FilesetManifest'
    FilesetManifest:
      type: object
      required: [schema, fileset_id, file_count, total_bytes, files]
      properties:
        schema:
          type: string
          example: fileset.v1
        fileset_id:
          type: string
        file_count:
          type: integer
        total_bytes:
          type: integer
        warnings:
          type: array
          items:
            type: string
        files:
          type: array
          items:
            type: object
            required: [path, sha256, size]
            properties:
              path:
                type: string
              sha256:
                type: string
              size:
                type: integer
`

export const OPENAPI_JSON = {
  "openapi": "3.0.3",
  "info": {
    "title": "Web-native CAS API",
    "version": "0.3.2",
    "description": "Minimal API for uploading a ZIP as a fileset and retrieving objects by sha256. Objects are stored as Brotli-compressed bytes; object identity and ETag are sha256(raw)."
  },
  "servers": [
    {
      "url": "http://127.0.0.1:8787"
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "summary": "Health check",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "/filesets": {
      "post": {
        "summary": "Upload a ZIP archive and create a fileset",
        "description": "Send the ZIP bytes as the request body with Content-Type: application/zip. The server streams entries, stores each file as a CAS object, then finalizes using Central Directory.",
        "parameters": [
          {
            "name": "update_ref",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Ref name to update (default: latest). Use empty to disable."
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/zip": {
              "schema": {
                "type": "string",
                "format": "binary"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created",
            "headers": {
              "Location": {
                "schema": {
                  "type": "string"
                },
                "description": "Fileset URL"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/FilesetCreateResponse"
                }
              },
              "text/plain": {
                "schema": {
                  "type": "string"
                }
              }
            }
          },
          "415": {
            "description": "Unsupported Media Type"
          }
        }
      }
    },
    "/filesets/{filesetId}": {
      "get": {
        "summary": "Get a fileset manifest",
        "parameters": [
          {
            "name": "filesetId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "headers": {
              "ETag": {
                "schema": {
                  "type": "string"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/FilesetManifest"
                }
              }
            }
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/objects/{sha256}": {
      "get": {
        "summary": "Get an object by sha256",
        "description": "Returns Brotli bytes when the client accepts br (Accept-Encoding includes br). ETag is always sha256(raw). Range is not supported.",
        "parameters": [
          {
            "name": "sha256",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "headers": {
              "Content-Encoding": {
                "schema": {
                  "type": "string"
                },
                "example": "br"
              },
              "ETag": {
                "schema": {
                  "type": "string"
                }
              }
            },
            "content": {
              "application/octet-stream": {
                "schema": {
                  "type": "string",
                  "format": "binary"
                }
              }
            }
          },
          "304": {
            "description": "Not Modified"
          },
          "406": {
            "description": "Not Acceptable (client does not accept br)"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/refs/{name}": {
      "get": {
        "summary": "Get a ref value",
        "parameters": [
          {
            "name": "name",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string"
                }
              }
            }
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "FilesetCreateResponse": {
        "type": "object",
        "required": [
          "filesetId",
          "manifest"
        ],
        "properties": {
          "filesetId": {
            "type": "string"
          },
          "updatedRef": {
            "type": "string",
            "nullable": true
          },
          "manifest": {
            "$ref": "#/components/schemas/FilesetManifest"
          }
        }
      },
      "FilesetManifest": {
        "type": "object",
        "required": [
          "schema",
          "fileset_id",
          "file_count",
          "total_bytes",
          "files"
        ],
        "properties": {
          "schema": {
            "type": "string",
            "example": "fileset.v1"
          },
          "fileset_id": {
            "type": "string"
          },
          "file_count": {
            "type": "integer"
          },
          "total_bytes": {
            "type": "integer"
          },
          "warnings": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "files": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "path",
                "sha256",
                "size"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "sha256": {
                  "type": "string"
                },
                "size": {
                  "type": "integer"
                }
              }
            }
          }
        }
      }
    }
  }
} as const;
