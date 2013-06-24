var fs = require( 'node-fs' );
var path = require( 'path' );
var extend = require( 'node.extend' );
var EventEmitter = require( 'events' ).EventEmitter;
var util = require( 'util' );
var crypto = require( 'crypto' );
var express = require( 'express' );

var defaults = {
    url: '/upload',
    directory: './',
    allowDownload: false,
    downloadPrefix: '/',
    overwrite: true
};

var Storehouse = function( _options ) {
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
    
    app.post( self.options.url, express.bodyParser(), function( request, response ) {
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
        var signature = crypto.createHash( 'sha1' ).update( request.body.path + fileInfo.type + self.options.secret ).digest( 'hex' );
        
        if ( signature != request.body.signature )
        {
            response.json( { error: 'invalid signature', message: 'Signature for this upload is invalid.' }, 400 );
            return;
        }

        var filename = path.normalize( self.options.directory + path.sep + request.body.path );
        var directory = path.dirname( filename );
        
        fs.exists( filename, function( exists ) {
            if ( exists && !self.options.overwrite )
            {
                response.json( { error: 'file exists', message: 'The file you are trying to upload already exists and cannot be overwritten.' }, 400 );
                return;
            }
            
            fs.mkdir( directory, '0755', true, function( error ) {
                if ( error )
                {
                    response.json( { error: 'error creating directory', message: error }, 500 );
                    return;
                }
                
                fs.rename( fileInfo.path, filename, function( error ) {
                    if ( error )
                    {
                        response.json( { error: 'error moving file', message: error }, 500 );
                        return;
                    }
                    
                    fs.chmod( filename, '0644', function( error ) {
                        if ( error )
                        {
                            response.json( { error: 'error changing file permissions', message: error }, 500 );
                            return;
                        }
    
                        response.json( { 'path': request.body.path } );
    
                        self.emit( 'uploaded', {
                            path: request.body.path,
                            directory: directory,
                            filename: filename,
                            location: path.resolve( filename ),
                            size: fileInfo.size,
                            type: fileInfo.type
                        });
                    });
                });        
            });
        });
    });
}

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
        var https = require( 'https' );
        var httpsServer = https.createServer({
            key: fs.readFileSync( options.ssl.key ),
            cert: fs.readFileSync( options.ssl.cert ),
            ca: options.ssl.ca || []
        }, app );

        httpsServer.listen( options.ssl.port );

        self.emit( 'listening', {
            ssl: true,
            port: options.ssl.port
        });
    }
    
    var http = require( 'http' );
    var httpServer = http.createServer( app );

    httpServer.listen( options.port );

    self.emit( 'listening', {
        port: options.port 
    });
    
    return self;
}

module.exports = Storehouse;