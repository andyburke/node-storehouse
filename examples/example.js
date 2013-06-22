var Storehouse = require( '../storehouse' );

var storehouse = new Storehouse({
    url: '/testupload',
    directory: './',
    allowDownload: true,
    downloadPrefix: '/stuff',
    secret: 'this is the secret key'
});

storehouse.listen({
    port: 8888 
});
