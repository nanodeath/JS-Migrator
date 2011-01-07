function Migrator(db){
	// Pending migrations to run
	var migrations = [];
	// Callbacks to run when migrations done
	var whenDone = [];

	var state = 0;
	
	var MIGRATOR_TABLE = "_migrator_schema";

	// Use this method to actually add a migration.
	// You'll probably want to start with 1 for the migration number.
	this.migration = function(number, func){
		migrations[number] = func;
	};
	
	// Execute a given migration by index
	var doMigration = function(number){
		if(migrations[number]){
			db.transaction(function(t){
				t.executeSql("update " + MIGRATOR_TABLE + " set version = ?", [number], function(t){
					debug(Migrator.DEBUG_HIGH, "Beginning migration %d", [number]);
					migrations[number](t);
					debug(Migrator.DEBUG_HIGH, "Completed migration %d", [number]);
					doMigration(number+1);
				}, function(t, err){
					error("Error!: %o (while upgrading to %s from %s)", err, number);
				})
			});
		} else {
			debug(Migrator.DEBUG_HIGH, "Migrations complete, executing callbacks.");
			state = 2;
			executeWhenDoneCallbacks();
		}
	};
	
	// helper that actually calls doMigration from doIt.
	var migrateStartingWith = function(ver){
		state = 1;
		debug(Migrator.DEBUG_LOW, "Main Migrator starting.");

		try {
			doMigration(ver+1);
		} catch(e) {
			error(e);
		}
	};

	this.execute = function(){
		if(state > 0){
			throw "Migrator is only valid once -- create a new one if you want to do another migration.";
		}
		db.transaction(function(t){
			t.executeSql("select version from " + MIGRATOR_TABLE, [], function(t, res){
				var rows = res.rows;
				var version = rows.item(0).version;
				debug(Migrator.DEBUG_HIGH, "Existing database present, migrating from %d", [version]);
				migrateStartingWith(version);
			}, function(t, err){
				if(err.message.match(/no such table/i)){
					t.executeSql("create table " + MIGRATOR_TABLE + "(version integer)", [], function(){
						t.executeSql("insert into " + MIGRATOR_TABLE + " values(0)", [], function(){
							debug(Migrator.DEBUG_HIGH, "New migration database created...");
							migrateStartingWith(0);
						}, function(t, err){
							error("Unrecoverable error inserting initial version into db: %o", err);
						});
					}, function(t, err){
						error("Unrecoverable error creating version table: %o", err);
					});
				} else {
					error("Unrecoverable error resolving schema version: %o", err);
				}
			});
		});

		return this;
	};

	// Called when the migration has completed.  If the migration has already completed,
	// executes immediately.  Otherwise, waits.
	this.whenDone = function(func){
		if(typeof func !== "array"){
			func = [func];
		}
		for(var f in func){
			whenDone.push(func[f]);
		}
		if(state > 1){
			debug(Migrator.DEBUG_LOW, "Executing 'whenDone' tasks immediately as the migrations have already finished.");
			executeWhenDoneCallbacks();
		}
	};
	
	var executeWhenDoneCallbacks = function(){
		for(var f in whenDone){
			whenDone[f]();
		}
		debug(Migrator.DEBUG_LOW, "Callbacks complete.");
	}
	
	// Debugging stuff.
	var log = (window.console && console.log) ? function() { console.log.apply(console, argumentsToArray(arguments)) } : function(){};
	var error = (window.console && console.error) ? function() { console.error.apply(console, argumentsToArray(arguments)) } : function(){};
	
	var debugLevel = Migrator.DEBUG_NONE;

	var argumentsToArray = function(args) { return Array.prototype.slice.call(args); };
	this.setDebugLevel = function(level){
		debugLevel = level;
	}
	
	var debug = function(minLevel, message, args){
		if(debugLevel >= minLevel){
			var newArgs = [message];
			if(args != null) for(var i in args) newArgs.push(args[i]);
		
			log.apply(null, newArgs);
		}
	}
}

// no output, low threshold (lots of output), or high threshold (just log the weird stuff)
// these might be a little, uh, backwards
Migrator.DEBUG_NONE = 0;
Migrator.DEBUG_LOW = 1;
Migrator.DEBUG_HIGH = 2;
