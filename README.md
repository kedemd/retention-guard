# retention-guard
Enforces limits on a folder

Retention guard use chokidar library to efficiently calculate the size of the folder and apply retention rules.

##Basic Usage

Retention guard will automatically delete old files to create room for new files.


    var RetentionGuard = require('retention-guard');

    var guard = new RetentionGuard('/path-to-dir', {
        expiresIn: 1000 * 60 * 60 * 24, // Delete files that are older than 24 hours
        maxSize: 1024 * 1024 * 500 // Delete files when folder size exeeds 500mb
    });

    guard.start();

    // guard.size <- current directory size
