var Silo = require( '../silo' );

var silo = new Silo({
    url: '/testupload',
    directory: './',
    allowDownload: true,
    downloadPrefix: '/stuff',
    secret: 'this is the secret key'
});

silo.listen({
    port: 8888 
});
