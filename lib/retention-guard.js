var fs = require('fs');
var Async = require('async');
var Chokidar = require('chokidar');

var internals = {};

internals.callback = function(err){
    if (err) {
        throw err;
    }
};

internals.RetentionGuard = function(dir, options){
    options = options || {};

    this._dir = dir;

    this._cache = {};
    this.size = 0;

    this.expiresIn = options.expiresIn || 0;
    this.maxSize = options.maxSize || 0;
};

internals.RetentionGuard.prototype.removeOld = function(callback){
    var self = this;
    var wasExplicit = callback ? true : false;
    callback = callback || internals.callback;

    if (!self.maxSize || !self.expiresIn){
        return callback();
    }

    if (!wasExplicit && self.size <= self.maxSize){
        return callback();
    }

    if (self.isRemoving){
        self.isPending = true;

        // Don't run twice
        return callback();
    }

    if (!self.isRemoving){
        self.isRemoving = true;
        self.isPending = false;
    }

    var expiredTime = Date.now() - self.expiresIn;

    Async.eachSeries(self._cache, function(currStat, next){
        if (currStat.atime.getTime() > expiredTime ||
            currStat.mtime.getTime() > expiredTime ||
            currStat.ctime.getTime() > expiredTime) {
            return next();
        }

        // The file is expired!
        fs.unlink(currStat.path, function(err){
            if (err && err.code == 'ENOENT'){
                delete self._cache[currStat.path];
                self.isRemoving = false;
                self.removeOld();

                return next();
            }

            return next(err);
        });
    }, function(err){
        if (err){
            return callback(err);
        }

        callback();

        self.isRemoving = false;
        if (self.isPending){
            self.isPending = false;
            self.removeOld();
        }
    });
};

internals.RetentionGuard.prototype.start = function(){
    var self = this;

    self._watcher = Chokidar.watch(self._dir, {});
    self._watcher
        .on('add', function(path) {
            fs.stat(path, function(err, stat){
                stat.path = path;

                self._cache[path] = stat;
                self.size += stat.size;

                self.removeOld();
            });
        })
        .on('change', function(path) {
            var cache = self._cache[path];
            if (cache){
                self.size -= cache.size;
                delete self._cache[path];
            }
            fs.stat(path, function(err, stat){
                if (!err && stat){
                    stat.path = path;
                    self._cache[path] = stat;
                    self.size += stat.size;
                } else {
                    // Log the error
                }


                self.removeOld();
            });
        })
        .on('unlink', function(path) {
            var cache = self._cache[path];
            if (cache){
                self.size -= cache.size;
                delete self._cache[path];
            }
        });
};

module.exports = internals.RetentionGuard;