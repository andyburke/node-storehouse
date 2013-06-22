Silo <img src="https://raw.github.com/andyburke/node-silo/master/silo.png" width="48" height="48" />
=========

Silo is a small, simple *node.js* module that allows you to easily handle HTTP file uploads. It also comes with a convenient command line utility for creating a standalone Silo server.

## Installation

Silo requires *node.js* and *npm*.

You can install Silo for use in your own project:

```
npm install silo
```

Or you can install Silo globally, making it easy to run the standalone server:

```
sudo npm install silo -g
```

## Usage

### In your project:

If you're already using express, you can attach a silo directly to your app:

```javascript
var Silo = require( 'silo' );

var silo = new Silo({
    url: '/fileupload',
    directory: './files',
    allowDownload: true,
    downloadPrefix: '/files',
    secret: 'this is the secret key'
});

silo.attach( app ); // attach to an existing express app
```

If you don't already have an express app, you can tell silo to listen on its own:

```javascript
silo.listen({
    port: 8888 
});
```

Silo also supports SSL:

```javascript
silo.listen({
    port: 8888,
    ssl: {
        key: './path/to/ssl.key',
        cert: './path/to/ssl.crt',
        port: 4443
    }
});
```

### As a standalone server:

```
  Usage: silo [options]

  Options:

    -h, --help                 output usage information
    -s, --secret <secret key>  Specify the secret key for the silo. !!REQUIRED!!
    --nooverwrite              Do not allow files to be overwritten.
    --url <url>                Specify the upload url. Eg: --url "/uploadfile"  Default: /upload
    -d, --directory <path>     Specify the location to store files. Eg: --directory ./files  Default: ./
    --allowDownload            Allow file downloads. Default: off
    --prefix <prefix>          Specify the prefix for downloading files. Eg: --prefix /files  Default: /
    -p, --port <port>          Specify the port to listen on. Default: 8888
    --sslkey <keyfile>         Specify an SSL key file.
    --sslcert <certfile>       Specify an SSL cert file.
    --quiet                    Do not print out upload events.
```

Example:

```
silo -s "this is the secret key" --allowDownload --url /testupload --nooverwrite
```

This would start a Silo server with the secret key "this is the secret key" that:
 - Allows downloads
 - Has an upload url of: /testupload
 - Does not allow overwriting existing files

## Cool, how do I keep everyone on the internet from uploading?

That's where the secret key comes in: to upload you must send a signature along with the file which Silo will validate.

The signature is a SHA1 of some information about the file plus the secret key. Specifically:

```javascript
var signature = crypto.createHash( 'sha1' ).update( request.body.path + fileInfo.type + self.options.secret ).digest( 'hex' );
```

The signature you send with the file must match this signature composed from the path you're trying to upload to, the file's mime type and your secret key.

## That's great, but how do I generate a signature without leaking my secret key?

Good question! Silo is mostly intended to be used as a part of an existing web infrastructure where you already have some kind of web service running.

In that service, you should expose a way for a user to obtain a signature for a file they'd like to upload. In that case, you can verify they have permission to upload and you can keep your secret key secret. Here's an example of how you might usually handle a file upload in this way:

```javascript
ajaxCall({
    url: '/api/fileuploadsignature',
    type: 'POST',
    data: {
        path: '/some/path/to/upload/to.png',
        type: 'image/png'
    },
    success: function( signature ) {
        // here your API has given us back a signature that allows this file to be uploaded,
        // now we can send the file to the server
        
        var formData = new FormData();

        formData.append( 'path', path );
        formData.append( 'signature', signature );
        formData.append( 'file', file ); // this would be from a file input in a form, for example
     
        var xhr = new XMLHttpRequest();
        
        xhr.onreadystatechange = function() {
            if ( xhr.readyState == 4 ) // complete
            {
                if ( xhr.status < 200 || xhr.status >= 400 )
                {
                    alert( xhr.responseText ); // oops, error!
                }
            }
        }
     
        xhr.upload.addEventListener( 'progress', function( progressEvent ) {
            if ( progressEvent.lengthComputable )
            {
                var percentComplete = Math.floor( ( progressEvent.loaded / progressEvent.total ) * 100 );
                console.log( percentComplete ); // let's print the progress of our upload to the console
            }
        }, false);
         
        xhr.addEventListener( 'load', function() {
            alert( 'Done!' );
        }, false );
         
        xhr.addEventListener( 'error', function( error ) {
           alert( error );
        }, false );
        
        xhr.addEventListener( 'abort', function() {
           alert( 'Aborted!' );
        }, false );
    
        xhr.open( 'POST', '/fileupload', true ); // open a post to whatever URL you've configured Silo to listen to
        xhr.send( formData ); // send the file
    }
});
```
