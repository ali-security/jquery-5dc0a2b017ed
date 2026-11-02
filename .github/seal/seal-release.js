/*
 * Sealed build (runs from the repo root): produce the release artifacts the way jquery-release does for
 * this repo, without the release tool's git/tag/publish steps. It hands
 * build/release.js a minimal Release object and calls its generateArtifacts()
 * (runs `grunt`, then writes the dist/cdn copies that ship in the npm package).
 * Needs build/release.js's own dependency shelljs@0.2.6 installed.
 */
"use strict";

var shell = require( "shelljs" ),
	pkg = require( "../../package.json" );

var Release = {
	newVersion: pkg.version,
	preRelease: false,
	complete: function() {},
	exec: function( cmd, errorMessage ) {
		console.log( "Executing: " + cmd );
		var result = shell.exec( cmd );
		if ( result.code !== 0 ) {
			throw new Error( errorMessage );
		}
		return result.output;
	},
	define: function( props ) {
		Object.keys( props ).forEach(function( key ) {
			Release[ key ] = props[ key ];
		});
	}
};

require( "../../build/release.js" )( Release );

Release.generateArtifacts(function( files ) {
	console.log( "Release artifacts: " + files.join( ", " ) );
	shell.ls( "dist/cdn" ).forEach(function( f ) {
		console.log( "  dist/cdn/" + f );
	});
});
