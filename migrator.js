function Migrator(db){
  var migrations = [];
  this.migration = function(number, func){
    migrations[number] = func;
  };
  var doMigration = function(number){
    if(migrations[number]){
      db.changeVersion(db.version, String(number), function(t){
        migrations[number](t);
      }, function(err){
        if(console.error) console.error("Error!: %o (while upgrading to %d)", err, number);
      }, function(){
        doMigration(number+1);
      });
    }
  };
  this.doIt = function(){
    var initialVersion = parseInt(db.version) || 0;
    try {
      doMigration(initialVersion+1);
    } catch(e) {
      if(console.error) console.error(e);
    }
  }
}
