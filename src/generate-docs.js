#!/usr/bin/env node
/* eslint-disable no-magic-numbers */

import { join, relative } from "path";
import fs from "fs";
import glob from "glob";

import _ from "lodash";
import commentParser from "comment-parser";
import traverse from "babel-traverse";
import { parse } from "babylon";


function green (text) {
  return `\x1b[32m${text}\x1b[0m`;
}

function red (text) {
  return `\x1b[31m${text}\x1b[0m`;
}

function loadAst (fpath) {
  const rawSource = fs.readFileSync(fpath, "utf-8");
  return parse(rawSource, {
    sourceType: "module",
    plugins: [
      "jsx",
      "flow",
      "asyncFunctions",
      "classConstructorCall",
      "doExpressions",
      "trailingFunctionCommas",
      "objectRestSpread",
      "decorators",
      "classProperties",
      "exportExtensions",
      "exponentiationOperator",
      "asyncGenerators",
      "functionBind",
      "functionSent"
    ]
  });
}

function findDoc (node, anscestorPaths) {
  if (node.leadingComments && node.leadingComments.length > 0) {
    return node.leadingComments[0].value;
  }
  for (const anscestor of anscestorPaths) {
    if ((anscestor.type === "VariableDeclaration" ||
        anscestor.type === "ExportNamedDeclaration" ||
        anscestor.type === "ExportDefaultDeclaration") &&
        anscestor.node.leadingComments &&
        anscestor.node.leadingComments.length > 0) {
      return anscestor.node.leadingComments[0].value;
    }
  }
  return null;
}

function getNamedFunctions (ast) {
  const functions = {};

  traverse(ast, {
    enter (path) {
      const node = path.node;
      if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression") &&
          node.id !== null) {
        functions[node.id.name] = {
          fnParams: node.params,
          name: node.id.name,
          fnStart: node.loc.start.line,
          fnEnd: node.loc.end.line,
          doc: findDoc(node, path.getAncestry())
        };
      }
    }
  });

  return functions;
}

function getEdges (objNode) {
  if (!objNode || objNode.type !== "ObjectExpression") {
    return [];
  }
  return _.map(objNode.properties, prop => prop.key.name);
}

function getPluggablesForFile (rootPath, fpath) {
  const ast = loadAst(fpath);
  const relPath = relative(rootPath, fpath);
  const namedFunctions = getNamedFunctions(ast);

  const pluggables = [];

  traverse(ast, {
    enter (path) {
      const node = path.node;
      if (node.type === "CallExpression" &&
          node.callee.name === "pluggable") {

        const pluggable = {
          path: relPath,
          pluggableLine: node.loc.start.line,
          edges: getEdges(node.arguments[1])
        };

        if (node.arguments[0].type === "FunctionExpression") {
          Object.assign(pluggable, {
            fnParams: node.arguments[0].params,
            name: node.arguments[0].id.name,
            fnStart: node.loc.start.line,
            fnEnd: node.loc.end.line,
            doc: findDoc(node, path.getAncestry())
          });
        } else {
          Object.assign(pluggable, namedFunctions[node.arguments[0].name]);
        }

        pluggable.fnParams = pluggable.fnParams.map(param => param.name);

        pluggables.push(pluggable);
      }
    }
  });

  return pluggables;
}

function parseDoc (pluggable) {
  const parsedDoc = pluggable.doc ? commentParser(`/*${pluggable.doc}*/`)[0] : null;
  if (pluggable.doc && !parsedDoc) {
    throw new Error(`Unable to parse JSDoc for "${pluggable.name}".\n\n/*${pluggable.doc}*/\n`);
  }
  return Object.assign({}, pluggable, { parsedDoc });
}

function getArgsMismatch (pluggable) {
  if (pluggable.parsedDoc) {
    const paramsHash = pluggable.parsedDoc.tags
      .filter(tag => tag.tag === "param")
      .reduce((hash, param) => {
        hash[param.name] = true;
        return hash;
      }, {});

    const rootParams = _.chain(Object.keys(paramsHash))
      .map(paramName => paramName.split(".")[0])
      .uniq()
      .value();

    if (rootParams.length !== pluggable.fnParams.length) {
      return `params length mismatch for '${pluggable.name}' in ${pluggable.path}`;
    }

    for (const param of pluggable.fnParams) {
      if (!paramsHash[param]) {
        return `mismatch for param '${param}' of '${pluggable.name}' in ${pluggable.path}`;
      }
    }

  }
  return null;
}

function getAllPluggables (srcGlob, rootPath) {
  return new Promise((resolve, reject) => {

    glob(srcGlob, function (err, fpaths) {
      if (err) {
        reject([err]);
        return;
      }

      const pluggables = _.chain(fpaths)
        .map(_.partial(getPluggablesForFile, rootPath))
        .flatten()
        .map(parseDoc)
        .value();

      const argsMismatches = _.chain(pluggables)
        .map(getArgsMismatch)
        .filter(x => x)
        .value();

      if (argsMismatches.length > 0) {
        reject(argsMismatches);
        return;
      }

      resolve(pluggables);
    });

  });
}

function assertNoDuplicates (pluggables) {
  const pHash = {};

  for (const pluggable of pluggables) {
    if (pluggable.name in pHash) {
      throw new Error(
        `duplicate pluggable '${pluggable.name}' found at\n` +
        `  ${pHash[pluggable.name].path}:${pHash[pluggable.name].fnStart}\n` +
        `  ${pluggable.path}:${pluggable.fnStart}`
        );
    }
    pHash[pluggable.name] = pluggable;
  }

  return pluggables;
}

function sortPluggables (pluggables) {
  return pluggables.sort((a, b) => {
    if (a.name < b.name) {
      return -1;
    } else if (a.name > b.name) {
      return 1;
    }
    return 0;
  });
}

function renderToMarkdown (pluggable) {
  const hasParsedDoc = !!pluggable.parsedDoc;
  const doc = hasParsedDoc ? `\n${pluggable.parsedDoc.description}\n` : "";

  let tagsData = "";
  if (hasParsedDoc) {
    tagsData += "\n" +
                "|     | Name | Type | Description |\n" +
                "| --- | ---- | ---- | ----------- |\n";

    tagsData += pluggable.parsedDoc.tags.map(tag => {
      const description = tag.description.replace(/\s+/g, " ");
      if (tag.tag === "param") {
        return `| Parameter | **${tag.name}** | ${tag.type} | ${description} |`;
      } else if (tag.tag === "return" || tag.tag === "returns") {
        // The JSdoc parser incorrectly interprets the first word in the description
        // as the name of the return value.
        return `| Return value |  | ${tag.type} | ${tag.name} ${description} |`;
      }
      return "";
    }).join("\n");

    tagsData += "\n\n";
  }

  let linksInfo;
  /* eslint-disable max-len */
  if (pluggable.pluggableLine === pluggable.fnStart) {
    linksInfo = `This Pluggable's definition can be found [here](http://github.com/interlockjs/interlock/tree/master/${pluggable.path}#L${pluggable.fnStart}-L${pluggable.fnEnd}).`;
  } else {
    linksInfo = `This Pluggable's definition can be found [here](http://github.com/interlockjs/interlock/tree/master/${pluggable.path}#L${pluggable.pluggableLine}).
      The function that it wraps can be found [here](http://github.com/interlockjs/interlock/tree/master/${pluggable.path}#L${pluggable.fnStart}-L${pluggable.fnEnd}).`;
  }
  /*eslint-enable max-len */

  return `## ${pluggable.name}
  ${doc}
  ${tagsData}
  ${linksInfo}

  `;
}

function trim (markdownText) {
  return markdownText
    .split("\n")
    .map(function (line) {
      return line.trim();
    })
    // .filter(x => x)
    .join("\n");
}

function buildJson (pluggables) {
  const byFnName = {};
  pluggables.forEach(p => byFnName[p.name] = p);

  function build (name) {
    const node = byFnName[name];
    const children = node.edges.map(build);
    const markdown = renderToMarkdown(node);
    const treeNode = { name, node, children, markdown };
    if (!children.length) { treeNode.size = 1; }
    return treeNode;
  }

  return build("compile");
}

export default function generateDocs (opts = {}) {
  const rootPath = opts.rootPath || process.cwd();
  const outputPath = join(rootPath, opts.outputPath);
  const jsonOutputPath = join(rootPath, opts.jsonOutputPath);
  const srcGlob = join(rootPath, opts.sources);
  const preamble = opts.preamble || "";

  const pluggables = getAllPluggables(srcGlob, rootPath)
    .then(assertNoDuplicates);

  const writeDocs = pluggables
    .then(sortPluggables)
    .then(_pluggables => {
      return _.chain(_pluggables)
        .map(renderToMarkdown)
        .map(trim)
        .reduce((bigMd, pluggableMd) => bigMd + pluggableMd, preamble)
        .value();
    })
    .then((md) => {
      fs.writeFileSync(outputPath, md);
      console.log(`${green("[ok]")} docs generated successfully`); // eslint-disable-line no-console
    })
    .catch(errs => {
      if (errs instanceof Array) {
        errs.forEach(err => console.log(`${red("[error]")} `, err)); // eslint-disable-line no-console,max-len
      } else {
        console.log(`${red("[error]")}`, errs); // eslint-disable-line no-console
      }
      process.exit(1); // eslint-disable-line no-process-exit
    });

  const writeJSON = pluggables
    .then(buildJson)
    .then(json => {
      fs.writeFileSync(jsonOutputPath, JSON.stringify(json, null, 2));
      console.log(`${green("[ok]")} JSON generated successfully`); // eslint-disable-line no-console
    })
    .catch(console.log.bind(console)); // eslint-disable-line no-console

  return Promise.all([writeDocs, writeJSON]);
}
