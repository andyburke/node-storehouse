var Storehouse = require( '../storehouse' );
var humanize = require( '../node_modules/humanize' );

var storehouse = new Storehouse({
    url: '/testupload',
    directory: './',
    allowDownload: true,
    secret: 'this is the secret key'
});

storehouse.listen({
    port: 8888 
});

storehouse.on( 'uploaded', function( event ) {
    console.log( humanize.date( 'c' ) + ' uploaded: ' + event.path + ' (' + event.location + ') ' + humanize.filesize( event.size ) );
} );

storehouse.on( 'fetched', function( event ) {
    console.log( humanize.date( 'c' ) + ' fetched url "' + event.url + '": ' + event.path + ' (' + event.location + ') ' + humanize.filesize( event.size ) );
} );

console.log( "Example listening, go here: http://localhost:8888/example.html" )