/**
 * Based on Stylish reporter from Sindre Sorhus
 */
'use strict';

var chalk = require('chalk'),
  table = require('text-table'),
  extend = require('extend');

var path = require('path');

var process = require('./process');
var minimist = require('minimist');

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Given a word and a count, append an s if count is not one.
 * @param {string} word A word in its singular form.
 * @param {int} count A number controlling whether word should be pluralized.
 * @returns {string} The original word with an s on the end if count is not one.
 */
function pluralize(word, count) {
  return (count === 1 ? word : word + 's');
}

var parseBoolEnvVar = function(varName) {
  var env = process.env || { };
  return env[varName] === 'true';
};

var subtleLog = function(args) {
  //return parseBoolEnvVar('EFF_NO_GRAY') ? args : chalk.white.bold(args);
  return chalk.bold(args);
};

var getEnvVar = function(varName) {
  var env = process.env || { };
  return env[varName] || false;
};

var getFileLink = function(_path, line, column) {
  var scheme = getEnvVar('EFF_EDITOR_SCHEME');
  if (scheme === false) {
    return false;
  }
  return scheme.replace('{file}', _path)
    .replace('{line}', chalk.green(line))
    .replace('{column}', chalk.cyan(column));
};

var getKeyLink = function(key, isError) {
  var noLinkRules = parseBoolEnvVar('EFF_NO_LINK_RULES');
  var url = key.indexOf('/') > -1 ? 'https://google.com/#q=' : 'http://eslint.org/docs/rules/';
  var keyColor = isError ? chalk.red(key) : chalk.yellow(key);
  //return (!noLinkRules) ? subtleLog(keyColor) : keyColor;
  return subtleLog(keyColor);
};

var printSummary = function(hash, title, method) {
  var res = '\n' + chalk[method](title + ':\n');
  res += table(
    Object.keys(hash).sort(function(a, b) {
      return hash[a] > hash[b] ? -1 : 1;
    }).map(function(key) {
      return [
        '',
        hash[key],
        getKeyLink(key, method === 'red')
      ];
    }), {
      align: [
        '',
        'r',
        'l'
      ],
      stringLength: function(str) {
        return chalk.stripColor(str).length;
      }
    });
  return res;
};

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

module.exports = function(results) {

  var output = '\n',
    total = 0,
    errors = 0,
    warnings = 0,
    summaryColor = 'yellow';

  results = results || [];

  var entries = [];

  var absolutePathsToFile = parseBoolEnvVar('EFF_ABSOLUTE_PATHS');

  var restArgs = process.argv.slice(process.argv.indexOf('--') + 1);
  var parsedArgs = minimist(restArgs);

  var groupByIssue = parsedArgs['eff-by-issue'];
  var filterRule = parsedArgs['eff-filter'];

  var errorsHash = { };
  var warningsHash = { };

  results.forEach(function(result) {
    var messages = result.messages || [];
    entries = entries.concat(messages.map(function(message) {
      return extend({
        filePath: absolutePathsToFile ? path.resolve(result.filePath) : result.filePath
      }, message);
    }));
  });

  entries.sort(function(a, b) {
    if (a.severity > b.severity) {
      return 1;
    }
    if (a.severity < b.severity) {
      return -1;
    }

    if (groupByIssue) {
      if (a.ruleId > b.ruleId) {
        return 1;
      }
      if (a.ruleId < b.ruleId) {
        return -1;
      }
    }

    var pathSort = a.filePath.localeCompare(b.filePath);
    if (pathSort) {
      return pathSort;
    }

    if (a.line > b.line) {
      return 1;
    }
    if (a.line < b.line) {
      return -1;
    }

    if (a.column > b.column) {
      return 1;
    }
    if (a.column < b.column) {
      return -1;
    }

    return 0;
  });

  output += table(
        entries.reduce(function(seq, message) {
          var messageType;
          var isError = true;

          if (filterRule) {
            if (message.ruleId !== filterRule) {
              return seq;
            }
          }

          if (message.fatal || message.severity === 2) {
            messageType = chalk.red('✘');
            summaryColor = 'red';
            errorsHash[message.ruleId] = (errorsHash[message.ruleId] || 0) + 1;
            errors++;
          } else {
            isError = false;
            messageType = chalk.yellow('⚠');
            summaryColor = 'yellow';
            warningsHash[message.ruleId] = (warningsHash[message.ruleId] || 0) + 1;
            warnings++;
          }

          var line = message.line || 0;
          var column = message.column || 0;

          var arrow = '';
          var hasSource = message.source !== undefined && message.source.length < 1000;
          if (hasSource) {
            for (var i = 0; i < message.column; i++) {
              if (message.source.charAt(i) === '\t') {
                arrow += '\t';
              } else {
                arrow += ' ';
              }
            }
            arrow += '^';
          }

          var filePath = message.filePath;
          var link = getFileLink(filePath, line, column);
          var msg = message.message.replace(/\.$/, '');
          var marker = '$MARKER$  ';
          seq.push([
            '',
            messageType + '  ' + getKeyLink(message.ruleId || '', isError),
            isError ? chalk.bold.red(msg) : chalk.bold.yellow(msg),
            '$MARKER$  ' + chalk.bold(filePath) + ' : ' + chalk.bold.green(line + ':' + column) +
            '$MARKER$  ' + (hasSource ? message.source + '$MARKER$  ' + arrow : '')
          ]);
          return seq;
        }, []), {
          align: [
            '',
            'l',
            'l',
            'l'
          ],
          stringLength: function(str) {
            return chalk.stripColor(str).length;
          }
        }).replace(/\$MARKER\$/g, '\n') + '\n\n';

  total = entries.length;

  if (total > 0) {
    output += chalk[summaryColor].bold([
      '✘ ',
      total,
      pluralize(' problem', total),
      ' (',
      errors,
      pluralize(' error', errors),
      ', ',
      warnings,
      pluralize(' warning', warnings),
      ')\n'
    ].join(''));

    if (errors > 0) {
      output += printSummary(errorsHash, 'Errors', 'red');
    }

    if (warnings > 0) {
      output += printSummary(warningsHash, 'Warnings', 'yellow');
    }
    output += '\n\n=========================================================='
  }

  return total > 0 ? output : '';
};
