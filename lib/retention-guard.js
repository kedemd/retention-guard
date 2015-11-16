var fs = require('fs');
var LockFile = require('proper-lockfile');
var Async = require('async');
var Chokidar = require('chokidar');

var internals = {};

internals.RetentionGuard = function(dir, options){
    options = options || {};

    this._dir = dir;

    this._cache = {};
    this.size = 0;

    this.expiresIn = options.expiresIn || 0;
    this.maxSize = options.maxSize || 0;
};

internals.RetentionGuard.prototype.removeOld = function(){
    var self = this;

    if (!self.maxSize || !self.expiresIn){
        return;
    }

    if (self.size <= self.maxSize){
        return;
    }

    if (self.isRemoving){
        self.isPending = true;

        // Don't run twice
        return;
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
            throw err;
        }

        self.isRemoving = false;
        if (self.isPending){
            self.isPending = false;
            self.removeOld();
        }
    });
};

internals.RetentionGuard.prototype.start = function(){
    var self = this;

    LockFile.lockSync(self._dir);

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
                stat.path = path;
                self._cache[path] = stat;
                self.size += stat.size;

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