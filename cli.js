#!/usr/bin/env node

'use strict';

const program = require( 'commander' );
const humanize = require( 'humanize' );

const keyfilename = '.storehouse_key';

program
    .usage( '[options]' )
    .option( '-s, --secret <secret key>', 'Specify the secret key. If this is not specifed, storehouse will check for a ' + keyfilename + ' file in the current directory. A key *must* be specified using this option or with a key file.' )
    .option( '--nooverwrite', 'Do not allow files to be overwritten.' )
    .option( '--uploadurl <url>', 'Specify the upload url. Eg: --uploadurl "/uploadfile"  Default: /upload' )
    .option( '--fetchurl <url>', 'Specify the fetch url. Eg: --fetchurl "/fetchfile"  Default: /fetch' )
    .option( '-d, --directory <path>', 'Specify the location to store files. Eg: --directory ./files  Default: ./' )
    .option( '--allowDownload', 'Allow file downloads. Default: off' )
    .option( '--prefix <prefix>', 'Specify the prefix for downloading files. Eg: --prefix /files  Default: /' )
    .option( '--cors', 'Allow CORS cross-domain requests.' )
    .option( '--cors_origin', 'Set the allowed origin(s) for CORS. Default: *' )
    .option( '-p, --port <port>', 'Specify the port to listen on. Default: 8888' )
    .option( '--sslkey <keyfile>', 'Specify an SSL key file.' )
    .option( '--sslcert <certfile>', 'Specify an SSL cert file.' )
    .option( '--quiet', 'Do not print out upload events.' )
    .parse( process.argv );

if ( !program.secret ) {
    const fs = require( 'fs' );
    if ( fs.existsSync( keyfilename ) ) {
        var keyfile_contents = fs.readFileSync( keyfilename, 'utf8' );
        program.secret = keyfile_contents.trim();
    }
    else {
        program.help();
        process.exit( 1 );
    }
}

let Storehouse = require( './storehouse' );

const options = {
    secret: program.secret
};

const listenOptions = {
    ssl: {}
};

if ( program.uploadurl ) {
    options.uploadURL = program.uploadurl;
}
if ( program.fetchurl ) {
    options.fetchURL = program.fetchurl;
}
if ( program.nooverwrite ) { options.overwrite = false;
}
if ( program.directory ) {
    options.directory = program.directory;
}
if ( program.allowDownload ) {
    options.allowDownload = true;
}
if ( program.prefix ) {
    options.downloadPrefix = program.prefix;
}
if ( program.cors ) {
    options.cors = true;
}
if ( program.cors_origin ) {
    options.origin = program.cors_origin;
}
if ( program.port ) {
    listenOptions.port = program.port;
}
if ( program.sslkey ) {
    listenOptions.ssl.key = program.sslkey;
}
if ( program.sslcert ) {
    listenOptions.ssl.cert = program.sslcert;
}

const storehouse = new Storehouse( options ).listen( listenOptions );

if ( !program.quiet ) {
    console.log( '*** Storehouse started ( ' + humanize.date( 'c' ) + ' )' );

    storehouse.on( 'upload-requested', function( event ) {
        console.log( humanize.date( 'c' ) + ' upload REQUESTED: ' + event.path + ' (' + event.location + ') ' + event.type + ' (encoding: ' + event.encoding + ')' );
    } );

    storehouse.on( 'uploaded', function( event ) {
        console.log( humanize.date( 'c' ) + ' uploaded: ' + event.path + ' (' + event.location + ') ' + humanize.filesize( event.size ) + ' ' + event.type + ' (encoding: ' + event.encoding + ')' );
    } );

    storehouse.on( 'fetch-requested', function( event ) {
        console.log( humanize.date( 'c' ) + ' url-fetch REQUESTED: "' + event.url + '": ' + event.path + ' (' + event.location + ')' );
    } );

    storehouse.on( 'fetched', function( event ) {
        console.log( humanize.date( 'c' ) + ' fetched url "' + event.url + '": ' + event.path + ' (' + event.location + ') ' + humanize.filesize( event.size ) + ' ' + event.type );
    } );
}
