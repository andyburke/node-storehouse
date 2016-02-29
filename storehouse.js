'use strict';

const http = require( 'http' );
const https = require( 'https' );
const requester = require( 'request' );
const fs = require( 'node-fs' );
const path = require( 'path' );
const extend = require( 'node.extend' );
const EventEmitter = require( 'events' ).EventEmitter;
const util = require( 'util' );
const crypto = require( 'crypto' );
const async = require( 'async' );
const express = require( 'express' );
const bodyParser = require( 'body-parser' );
const multer = require( 'multer' );
const magic = require( 'mmmagic' );
const mimeMagic = new magic.Magic( magic.MAGIC_MIME_TYPE );

const defaults = {
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
    const self = this;
    EventEmitter.call( self );

    self.options = extend( {}, defaults, _options );

    if ( !self.options.secret ) {
        throw 'You must specify a secret.';
    }
}

util.inherits( Storehouse, EventEmitter );

Storehouse.prototype.attach = function( app ) {
    const self = this;

    if ( self.options.allowDownload ) {
        const staticMiddleware = express.static( self.options.directory[ 0 ] === path.sep ? self.options.directory : process.cwd() + path.sep + self.options.directory );

        app.use( self.options.downloadPrefix, staticMiddleware );
    }

    function AllowCORS( request, response, next ) {
        response.header( 'Access-Control-Allow-Origin', self.options.origin );
        response.header( 'Access-Control-Allow-Methods', 'POST' );

        if ( !!request.headers[ 'access-control-request-headers' ] ) {
            response.header( 'Access-Control-Allow-Headers', request.headers[ 'access-control-request-headers' ] );
        }

        if ( request.method === 'OPTIONS' ) {
            response.send( 200 );
            return;
        }

        next();
    }

    if ( self.options.cors ) {
        app.all( self.options.uploadURL, AllowCORS );
        app.all( self.options.fetchURL, AllowCORS );
    }

    app.post( self.options.uploadURL, bodyParser(), multer(), function( request, response, next ) {
        const filename = path.normalize( self.options.directory + path.sep + request.body.path );
        const directory = path.dirname( filename );
        const fileInfo = request.files.file;

        self.emit( 'upload-requested', {
            path: request.body.path,
            directory: directory,
            filename: filename,
            location: path.resolve( filename ),
            type: fileInfo.mimetype,
            encoding: fileInfo.encoding
        } );

        self.AcceptUpload( request, response, next );
    } );

    app.post( self.options.fetchURL, bodyParser(), multer(), function( request, response, next ) {
        const filename = path.normalize( self.options.directory + path.sep + request.body.path );
        const directory = path.dirname( filename );

        self.emit( 'fetch-requested', {
            url: request.body.url,
            path: request.body.path,
            directory: directory,
            filename: filename,
            location: path.resolve( filename )
        } );

        self.Fetch( request, response, next );
    } );
};

Storehouse.prototype._getSignature = function( request ) {
    const self = this;

    let parts = [];
    const keys = Object.keys( request.body ).sort();
    keys.forEach( function( key ) {
        if ( key === 'signature' || key === 'file' ) {
            return;
        }

        parts.push( key + '=' + request.body[ key ] );
    } );

    parts.push( 'secret=' + self.options.secret );

    return crypto.createHash( 'sha1' ).update( parts.join( '&' ) ).digest( 'hex' );
};

Storehouse.prototype.AcceptUpload = function( request, response ) {
    const self = this;

    if ( !request.files || !request.files.file ) {
        response.json( {
            error: 'file missing',
            message: 'No file present in request.'
        }, 400 );
        return;
    }

    if ( !request.body.path ) {
        response.json( {
            error: 'path missing',
            message: 'No path specified in request.'
        }, 400 );
        return;
    }

    if ( !request.body.signature ) {
        response.json( {
            error: 'signature missing',
            message: 'No signature specified in request.'
        }, 400 );
        return;
    }

    if ( self._getSignature( request ) !== request.body.signature ) {
        response.json( {
            error: 'invalid signature',
            message: 'Signature for this upload is invalid.'
        }, 400 );
        return;
    }

    const fileInfo = request.files.file;
    const filename = path.normalize( self.options.directory + path.sep + request.body.path );
    const directory = path.dirname( filename );

    async.series( [
        // check if the file exists and if we can overwrite it if it does
        checkExists.bind( null, filename, self.options.overwrite ),

        // create the necessary directory structure
        createDirectory.bind( null, directory ),

        // move the uploaded file from its temp location to the target location
        moveToDestination.bind( null, fileInfo.path, filename ),

        // set proper permissions on the uploaded file
        setNormalPermissions.bind( null, filename )
    ], function( error ) {
        if ( error ) {
            response.json( error, error.code || 500 );
            return;
        }

        response.json( {
            'path': request.body.path
        } );

        fs.stat( filename, function( error, stats ) {
            if ( error ) {
                console.error( error );
            }

            self.emit( 'uploaded', {
                path: request.body.path,
                directory: directory,
                filename: filename,
                location: path.resolve( filename ),
                size: stats ? stats.size : -1,
                type: fileInfo.mimetype,
                encoding: fileInfo.encoding
            } );
        } );
    } );
};

Storehouse.prototype.Fetch = function( request, response ) {
    const self = this;

    if ( !request.body.url ) {
        response.json( {
            error: 'url missing',
            message: 'No url to fetch specified in request.'
        }, 400 );
        return;
    }

    if ( !request.body.path ) {
        response.json( {
            error: 'path missing',
            message: 'No path specified in request.'
        }, 400 );
        return;
    }

    if ( !request.body.signature ) {
        response.json( {
            error: 'signature missing',
            message: 'No signature specified in request.'
        }, 400 );
        return;
    }

    if ( self._getSignature( request ) !== request.body.signature ) {
        response.json( {
            error: 'invalid signature',
            message: 'Signature for this fetch request is invalid.'
        }, 400 );
        return;
    }

    const filename = path.normalize( self.options.directory + path.sep + request.body.path );
    const directory = path.dirname( filename );

    async.series( [
        // check if the file exists and if we can overwrite it if it does
        checkExists.bind( null, filename, self.options.overwrite ),

        // create the necessary directory structure
        createDirectory.bind( null, directory ),

        // fetch the file
        function( callback ) {
            let file = fs.createWriteStream( filename );

            file.on( 'finish', function() {
                file.close( callback );
            } );

            requester.get( request.body.url ).pipe( file ).on( 'error', function( error ) {
                fs.unlink( filename );
                callback( error );
            } );
        },

        // set proper permissions on the uploaded file
        setNormalPermissions.bind( null, filename )

    ], function( error ) {
        if ( error ) {
            response.json( error, error.code || 500 );
            return;
        }

        response.json( {
            'path': request.body.path
        } );

        fs.stat( filename, function( error, stats ) {
            if ( error ) {
                console.error( error );
            }

            mimeMagic.detectFile( filename, function( mimeError, mimeType ) {
                if ( mimeError ) {
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

const listenDefaults = {
    port: 8888,
    ssl: {
        port: 4443
    }
};

Storehouse.prototype.listen = function( _options ) {
    const self = this;

    const options = extend( {}, listenDefaults, _options );

    const app = express();
    self.attach( app );

    if ( options.ssl && options.ssl.key && options.ssl.cert ) {
        const httpsServer = https.createServer( {
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

    const httpServer = http.createServer( app );

    httpServer.listen( options.port );

    self.emit( 'listening', {
        port: options.port
    } );

    return self;
};

function checkExists( filename, overwritable, callback ) {
    fs.exists( filename, function( exists ) {
        if ( exists && !overwritable ) {
            callback( {
                error: 'file exists',
                message: 'The file you are trying to upload already exists and cannot be overwritten.',
                code: 400
            } );
            return;
        }

        callback();
    } );
}

function createDirectory( directory, callback ) {
    fs.mkdir( directory, '0755', true, function( error ) {
        if ( error ) {
            callback( {
                error: 'error creating directory',
                message: error,
                code: 500
            } );
            return;
        }

        callback();
    } );
}

function moveToDestination( source, dest, callback ) {
    fs.rename( source, dest, function( error ) {
        if ( error ) {
            callback( {
                error: 'error moving file',
                message: error,
                code: 500
            } );
            return;
        }

        callback();
    } );
}

function setNormalPermissions( filename, callback ) {
    fs.chmod( filename, '0644', function( error ) {
        if ( error ) {
            callback( {
                error: 'error changing file permissions',
                message: error,
                code: 500
            } );
            return;
        }

        callback();
    } );
}
