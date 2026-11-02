/*
 * Headless runner for the jQuery QUnit suite (test/index.html).
 *
 * Added by the sealed build: upstream ran this suite only in real browsers via
 * TestSwarm, so CI (`npm test` = `grunt`) never executed it. This script loads
 * the suite in headless Chrome (via puppeteer-core), prints one line per test
 * plus failing assertions, and a final summary; it exits non-zero on failure.
 *
 * Usage: node .github/seal/run-headless.js <base-url> [<query-string>]
 *   e.g. node .github/seal/run-headless.js http://127.0.0.1:8000 dev
 * Env: PUPPETEER_MODULE (path of puppeteer-core), CHROME_BIN (browser binary).
 */
"use strict";

var puppeteer = require( process.env.PUPPETEER_MODULE || "puppeteer-core" );

var base = process.argv[ 2 ] || "http://127.0.0.1:8000";
var query = process.argv[ 3 ] || "";
var target = base + "/test/index.html" + ( query ? "?" + query : "" );
var TIMEOUT_MS = 20 * 60 * 1000;

// Individual tests that cannot pass in a current headless Chrome because the
// browser itself changed after this release (2014); each is skipped by
// "module :: name" and reported in the log with its reason.
var EXCLUDED = {
	"support :: Check CSP (https://developer.mozilla.org/en-US/docs/Security/CSP) restrictions":
		"current Chrome sends a script-src-attr CSP report for the onfocusin " +
		"feature-detect setAttribute on a detached div (Chrome of 2014 did not)",
	"ajax :: #14379 - jQuery.ajax() on unload":
		"Chrome 80+ forbids synchronous XHR during page dismissal (unload), so " +
		"the request always errors regardless of jQuery",
	"offset :: fractions (see #7730 and #7885)":
		"Chrome LayoutNG snaps positions to 1/64px, so offset() reports 999.984375 " +
		"instead of 1000"
};

function hook( excluded ) {
	if ( window !== window.top ) {
		return;
	}
	var current;
	Object.defineProperty( window, "QUnit", {
		configurable: true,
		get: function() {
			return current;
		},
		set: function( q ) {
			current = q;
			if ( q && !q.__sealHooked ) {
				q.__sealHooked = true;
				var origTest = q.test;
				var wrapped = function( testName ) {
					var key = ( q.config.currentModule || "" ) + " :: " + testName;
					if ( Object.prototype.hasOwnProperty.call( excluded, key ) ) {
						window.__sealReport( "skip", { key: key, reason: excluded[ key ] } );
						return;
					}
					return origTest.apply( q, arguments );
				};
				q.test = wrapped;
				window.test = wrapped;
				var failures = [];
				q.log(function( d ) {
					if ( !d.result ) {
						failures.push( ( d.message || "" ) +
							( d.expected !== undefined ? " | expected: " + String( d.expected ) +
								" | actual: " + String( d.actual ) : "" ) );
					}
				});
				q.testDone(function( d ) {
					window.__sealReport( "test", {
						module: d.module, name: d.name, failed: d.failed,
						passed: d.passed, total: d.total, failures: failures
					} );
					failures = [];
				});
				q.done(function( d ) {
					window.__sealReport( "done", d );
				});
			}
		}
	});
}

( async function main() {
	var browser = await puppeteer.launch({
		executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
		headless: "new",
		args: [ "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage" ]
	});
	var page = await browser.newPage();
	var stats = { tests: 0, testsFailed: 0, skipped: 0 };
	var finished;
	var done = new Promise(function( resolve ) {
		finished = resolve;
	});

	await page.exposeFunction( "__sealReport", function( kind, d ) {
		if ( kind === "test" ) {
			stats.tests++;
			if ( d.failed ) {
				stats.testsFailed++;
			}
			console.log( ( d.failed ? "FAIL " : "PASS " ) + d.module + " :: " + d.name +
				" (" + d.passed + "/" + d.total + " assertions passed)" );
			d.failures.forEach(function( f ) {
				console.log( "    failed assertion: " + f );
			});
		} else if ( kind === "skip" ) {
			stats.skipped++;
			console.log( "SKIP " + d.key + " -- excluded: " + d.reason );
		} else {
			finished( d );
		}
	});
	await page.evaluateOnNewDocument( hook, EXCLUDED );
	page.on( "pageerror", function( e ) {
		console.log( "[page error] " + e.message );
	});

	console.log( "Running " + target );
	await page.goto( target, { waitUntil: "load" } );

	var timer;
	var result = await Promise.race([ done, new Promise(function( resolve ) {
		timer = setTimeout(function() {
			resolve( null );
		}, TIMEOUT_MS );
	}) ]);
	clearTimeout( timer );
	await browser.close();

	if ( !result ) {
		console.log( "TIMEOUT: QUnit did not finish within " + TIMEOUT_MS + "ms" );
		process.exit( 2 );
	}
	console.log( "" );
	console.log( "QUnit summary (" + target + "): " + ( stats.tests - stats.testsFailed ) +
		" of " + stats.tests + " tests passed, " + stats.testsFailed + " failed, " + stats.skipped + " skipped (excluded, see SKIP lines); assertions: " +
		result.passed + " passed, " + result.failed + " failed, " + result.total + " total (" +
		result.runtime + "ms)" );
	process.exit( result.failed || stats.testsFailed ? 1 : 0 );
})().catch(function( e ) {
	console.error( e );
	process.exit( 3 );
});
