var fs = require('fs');
var Async = require('async');
var Chokidar = require('chokidar');
var Disk = require('diskusage');

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
    this.minFreeSpace = options.minFreeSpace || 0;
};

internals.RetentionGuard.prototype._removeOld = function(callback){
    var self = this;

    // Is already in the process of removing files
    if (self.isRemoving){
        self.isPending = true;

        // Don't run twice
        return callback();
    }

    // RemovedOld Initialization
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
                // The file was already removed
                delete self._cache[currStat.path];
                self.isRemoving = false;
                self._removeOld(callback);

                return next();
            }
            if (err){
                return next(err);
            } else {
                // Remove from the cache, will later be ignored from the 'unlink' event listener
                self.size -= currStat.size;
                delete self._cache[currStat.path];

                return next();
            }
        });
    }, function(err){
        if (err){
            return callback(err);
        }

        callback();

        self.isRemoving = false;
        if (self.isPending){
            self.isPending = false;
            self._removeOld(callback);
        }
    });
};

internals.RetentionGuard.prototype.removeOld = function(callback){
    var self = this;
    var wasExplicit = callback ? true : false;
    callback = callback || internals.callback;

    // Removed old files function was called directly
    if (wasExplicit && self.expiresIn) {
        return self._removeOld(callback);
    }

    // Nothing will be deleted ever
    if (!self.expiresIn || (!self.maxSize && !self.minFreeSpace)){
        return callback();
    }

    // Passed the maximum folder size limit
    if (self.size > self.maxSize){
        return self._removeOld(callback);
    }

    if (self.minFreeSpace) {
        Disk.check(self._dir, function(err,info){
            if (err){
                return callback(err);
            }

            // Passed the minimum free space requirement.
            if (info.free < self.minFreeSpace) {
                return self._removeOld(callback);
            }

            // No criterion for removing old files was matched
            return callback();
        });
    } else {
        return callback();
    }
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