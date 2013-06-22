#!/usr/bin/env node
var program = require( 'commander' );
var humanize = require( 'humanize' );

program
    .usage( '[options]' )
    .option( '-s, --secret <secret key>', 'Specify the secret key. !!REQUIRED!!' )
    .option( '--nooverwrite', 'Do not allow files to be overwritten.' )
    .option( '--url <url>', 'Specify the upload url. Eg: --url "/uploadfile"  Default: /upload' )
    .option( '-d, --directory <path>', 'Specify the location to store files. Eg: --directory ./files  Default: ./' )
    .option( '--allowDownload', 'Allow file downloads. Default: off' )
    .option( '--prefix <prefix>', 'Specify the prefix for downloading files. Eg: --prefix /files  Default: /' )
    .option( '-p, --port <port>', 'Specify the port to listen on. Default: 8888' )
    .option( '--sslkey <keyfile>', 'Specify an SSL key file.' )
    .option( '--sslcert <certfile>', 'Specify an SSL cert file.' )
    .option( '--quiet', 'Do not print out upload events.' )
    .parse( process.argv );

if ( !program.secret )
{
    program.help();
    process.exit( 1 );
}

var Storehouse = require( './storehouse' );

var options = {
    secret: program.secret
};

var listenOptions = {
    ssl: {}
}

if ( program.url )           options[ 'url' ] = program.url;
if ( program.nooverwrite )   options[ 'overwrite' ] = false;
if ( program.directory )     options[ 'directory' ] = program.directory;
if ( program.allowDownload ) options[ 'allowDownload' ] = true;
if ( program.prefix )        options[ 'downloadPrefix' ] = program.prefix;
if ( program.port )          listenOptions[ 'port' ] = program.port;
if ( program.sslkey )        listenOptions.ssl[ 'key' ] = program.sslkey;
if ( program.sslcert )       listenOptions.ssl[ 'cert' ] = program.sslcert;

var storehouse = new Storehouse( options ).listen( listenOptions );

if ( !program.quiet )
{
    storehouse.on( 'uploaded', function( event ) {
        console.log( humanize.date( 'c' ) + ' uploaded: ' + event.path + ' (' + event.location + ') ' + humanize.filesize( event.size ) );
    });
}
