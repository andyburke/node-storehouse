var http = require( 'http' );
var https = require( 'https' );
var requester = require( 'request' );
var fs = require( 'node-fs' );
var path = require( 'path' );
var extend = require( 'node.extend' );
var EventEmitter = require( 'events' ).EventEmitter;
var util = require( 'util' );
var crypto = require( 'crypto' );
var async = require( 'async' );
var express = require( 'express' );
var bodyParser = require( 'body-parser' );
var multer = require( 'multer' );
var magic = require( 'mmmagic' );
var mimeMagic = new magic.Magic( magic.MAGIC_MIME_TYPE );

var defaults = {
    uploadURL: '/upload',
    fetchURL: '/fetch',
    directory: './',
    allowDownload: false,
    downloadPrefix: '/',
    overwrite: true,
    origin: '*'
};

module.exports = Storehouse;

function Storehouse( _options ) {
    var self = this;
    EventEmitter.call( self );
    
    self.options = extend( {}, defaults, _options );
    
    if ( !self.options.secret )
    {
        throw 'You must specify a secret.';
    }
}

util.inherits( Storehouse, EventEmitter );

Storehouse.prototype.attach = function( app ) {
    var self = this;

    if ( self.options.allowDownload )
    {
        var staticMiddleware = express.static( self.options.directory[ 0 ] == path.sep ? self.options.directory : ( process.cwd() + path.sep + self.options.directory ) );
        
        app.use( self.options.downloadPrefix, staticMiddleware );
    }
    
    function AllowCORS( request, response, next ) {
        response.header( 'Access-Control-Allow-Origin', self.options.origin );
        response.header( 'Access-Control-Allow-Methods', 'POST' );
        response.header( 'Access-Control-Allow-Headers', request.headers[ 'access-control-request-headers' ] );
    
        if ( request.method === 'OPTIONS' )
        {
            response.send( 200 );
            return;
        }
        
        next();
    }

    if ( self.options.cors )
    {
        app.all( self.options.uploadURL, AllowCORS );
        app.all( self.options.fetchURL, AllowCORS );
    }
    
    app.post( self.options.uploadURL, bodyParser(), multer(), function( request, response, next ) {
        self.AcceptUpload( request, response, next );
    } );

    app.post( self.options.fetchURL, bodyParser(), multer(), function( request, response, next ) {
        self.Fetch( request, response, next );
    } );
}

Storehouse.prototype.AcceptUpload = function( request, response ) {
    var self = this;
    
    if ( !request.files || !request.files[ 'file' ] )
    {
        response.json( { error: 'file missing', message: 'No file present in request.' }, 400 );
        return;
    }
    
    if ( !request.body.path )
    {
        response.json( { error: 'path missing', message: 'No path specified in request.' }, 400 );
        return;
    }

    if ( !request.body.signature )
    {
        response.json( { error: 'signature missing', message: 'No signature specified in request.' }, 400 );
        return;
    }
    
    var fileInfo = request.files[ 'file' ];
    var signature = crypto.createHash( 'sha1' ).update( request.body.path + fileInfo.mimetype + self.options.secret ).digest( 'hex' );
    
    if ( signature != request.body.signature )
    {
        response.json( { error: 'invalid signature', message: 'Signature for this upload is invalid.' }, 400 );
        return;
    }

    var filename = path.normalize( self.options.directory + path.sep + request.body.path );
    var directory = path.dirname( filename );
    
    async.series( [
        // check if the file exists and if we can overwrite it if it does
        function( callback ) {
            fs.exists( filename, function( exists ) {
                if ( exists && !self.options.overwrite )
                {
                    callback( { error: 'file exists', message: 'The file you are trying to upload already exists and cannot be overwritten.', code: 400 } );
                    return;
                }
            
                callback();
            } );
        },
        
        // create the necessary directory structure
        function( callback ) {
            fs.mkdir( directory, '0755', true, function( error ) {
                if ( error )
                {
                    callback( { error: 'error creating directory', message: error, code: 500 } );
                    return;
                }
            
                callback();
            } );
        },
        
        // move the uploaded file from its temp location to the target location
        function( callback ) {
            fs.rename( fileInfo.path, filename, function( error ) {
                if ( error )
                {
                    callback( { error: 'error moving file', message: error, code: 500 } );
                    return;
                }
            
                callback();
            } );
        },
        
        // set proper permissions on the uploaded file
        function( callback ) {
            fs.chmod( filename, '0644', function( error ) {
                if ( error )
                {
                    callback( { error: 'error changing file permissions', message: error, code: 500 } );
                    return;
                }
            
                callback();
            } );
        }
        
    ], function( error ) {
        if ( error )
        {
            response.json( error, error.code || 500 );
            return;
        }
        
        response.json( { 'path': request.body.path } );

        fs.stat( filename, function( error, stats ) {
            if ( error )
            {
                console.error( error );
            }
            
            self.emit( 'uploaded', {
                path: request.body.path,
                directory: directory,
                filename: filename,
                location: path.resolve( filename ),
                size: stats ? stats.size : -1,
                type: fileInfo.type
            } );
        } );
    } );
};

Storehouse.prototype.Fetch = function( request, response ) {
    var self = this;
    
    if ( !request.body.url )
    {
        response.json( { error: 'url missing', message: 'No url to fetch specified in request.' }, 400 );
        return;
    }
    
    if ( !request.body.path )
    {
        response.json( { error: 'path missing', message: 'No path specified in request.' }, 400 );
        return;
    }

    if ( !request.body.signature )
    {
        response.json( { error: 'signature missing', message: 'No signature specified in request.' }, 400 );
        return;
    }
    
    var signature = crypto.createHash( 'sha1' ).update( request.body.url + request.body.path + self.options.secret ).digest( 'hex' );
    
    if ( signature != request.body.signature )
    {
        response.json( { error: 'invalid signature', message: 'Signature for this fetch request is invalid.' }, 400 );
        return;
    }

    var filename = path.normalize( self.options.directory + path.sep + request.body.path );
    var directory = path.dirname( filename );
    
    async.series( [
        // check if the file exists and if we can overwrite it if it does
        function( callback ) {
            fs.exists( filename, function( exists ) {
                if ( exists && !self.options.overwrite )
                {
                    callback( { error: 'file exists', message: 'The path you are trying to fetch to already exists and cannot be overwritten.', code: 400 } );
                    return;
                }
            
                callback();
            } );
        },
        
        // create the necessary directory structure
        function( callback ) {
            fs.mkdir( directory, '0755', true, function( error ) {
                if ( error )
                {
                    callback( { error: 'error creating directory', message: error, code: 500 } );
                    return;
                }
            
                callback();
            } );
        },
        
        // fetch the file
        function( callback ) {
            var file = fs.createWriteStream( filename );

            file.on( 'finish', function() {
                file.close( callback );
            } );

            requester.get( request.body.url ).pipe( file ).on( 'error', function( error ) {
                fs.unlink( filename );
                callback( error );
            } );
        },
        
        // set proper permissions on the uploaded file
        function( callback ) {
            fs.chmod( filename, '0644', function( error ) {
                if ( error )
                {
                    callback( { error: 'error changing file permissions', message: error, code: 500 } );
                    return;
                }
            
                callback();
            } );
        },
        
    ], function( error ) {
        if ( error )
        {
            response.json( error, error.code || 500 );
            return;
        }
        
        response.json( { 'path': request.body.path } );

        fs.stat( filename, function( error, stats ) {
            if ( error )
            {
                console.error( error );
            }

            mimeMagic.detectFile( filename, function( mimeError, mimeType ) {
                if ( mimeError )
                {
                    console.error( mimeError );
                }
                
                self.emit( 'fetched', {
                    url: request.body.url,
                    path: request.body.path,
                    directory: directory,
                    filename: filename,
                    location: path.resolve( filename ),
                    size: stats ? stats.size : -1,
                    type: mimeType
                } );
            } );
        } );
    } );
};

var listenDefaults = {
    port: 8888,
    ssl: {
        port: 4443
    }
};

Storehouse.prototype.listen = function( _options ) {
    var self = this;

    var options = extend( {}, listenDefaults, _options );
    
    var app = express();
    self.attach( app );

    if ( options.ssl && options.ssl.key && options.ssl.cert )
    {
        var httpsServer = https.createServer({
            key: fs.readFileSync( options.ssl.key ),
            cert: fs.readFileSync( options.ssl.cert ),
            ca: options.ssl.ca || []
        }, app );

        httpsServer.listen( options.ssl.port );

        self.emit( 'listening', {
            ssl: true,
            port: options.ssl.port
        } );
    }
    
    var httpServer = http.createServer( app );

    httpServer.listen( options.port );

    self.emit( 'listening', {
        port: options.port 
    } );
    
    return self;
}
