var os 			= require('os')
  , when 		= require('when')
  , _ 			= require('underscore')
  , path 		= require('path');

var appRoot 	= path.resolve(__dirname, '../../')
  , paths 		= require(appRoot + '/core/paths');

var Command 	= require(paths.core + '/command')
  , Service 	= require(paths.core + '/service')
  , log 		= require(paths.logger)('DRIVE_SPACE');

var idCounter = 0;
function Drive(options) {
	idCounter += 1;

	this._id = idCounter;

	this.label = options.label;
	this.location = options.location;

	_.defaults(options, Drive.defaultOptions);
	this.options = options;
	
	this.os = (this.os) ? this.options.os : os.type().toLowerCase();

	this.command = Command(options.remote);
}

Drive.defaultOptions = {
	remote: false,

	total: 0,
	icon: '',

	os: 'linux'
};

Drive.prototype.getDriveSpace = function() {
	var self = this, promise = when.defer()
	  , start = new Date().getTime();

	log.debug('Getting drive space for', this.label.yellow, 'using', 'df'.red, 'command');

	df(self).then(function(data) {
		if(_.isNaN(data.used)) {
			log.debug('Falling back to', 'du'.red, 'for', self.label.yellow);
			du(self).then(finish).otherwise(promise.reject);
		} else {
			finish(data);
		}
	}).otherwise(function(reason) {
		var json = {
			_id:		this._id,
			label:		this.label,
			icon:		this.getIcon(),
			err:		reason.message,
			offline:	true
		};

		switch(reason.message) {
			case 'AUTHENTICATION_FAILED':
				json.detail = 'Username and password failed. Please double check username and password for drive settings \'' + this.label + '\'';
				break;
			case 'CONNECTION_FAILED':
			case 'SERVER_OFFLINE':
				json.detail = 'Connection failed. Please double check the settings for drive settings \'' + this.label + '\'';
				break;
			case 'CONNECTION_TIMEOUT':
				json.detail = 'Connection timed out to getting drive information \'' + this.label + '\'';
				break;
		}
		promise.resolve(json);
	}.bind(this));

	function finish(data) {
		var since = new Date().getTime() - start;

		log.debug('Finished processing drive stats for', self.label.yellow + '.', 'Took ' + since + 'ms');

		promise.resolve(data);
	}

	return promise.promise;
};

Drive.prototype.getIcon = function() {
	return (this.options && this.options.icon) ? this.options.icon : false;
};

function formatResponse(drive, used, total) {
	var total = (drive.options.total && drive.options.total != 0) ? drive.options.total : total;
	    total = (total) ? total : 0;

	return {
		_id: 		drive._id,
		label: 		drive.label,
		icon: 		drive.getIcon(),
		used: 		used,
		total: 		total
	};
}

function df(drive) {
	var promise = when.defer();

	function process(stdout) {
		var lines = stdout.split('\n');
		var str_drive_info = lines[1].replace( /[\s\n\r]+/g,' ');
		var drive_info = str_drive_info.split(' ');
	
		return formatResponse(drive, parseInt(drive_info[2]) * 1024, parseInt(drive_info[1]) * 1024);
	}

	var size = (drive.os == 'linux') ? '--block-size=1024' : '-k';


	drive.command('df ' + size + ' "' + drive.location + '"').then(process).then(promise.resolve).catch(function(e) {
		promise.reject(e);
	});
	return promise.promise;
}

function du(drive) {
	var promise = when.defer();

	function process(stdout) {
		var find = stdout.match(/(\d+)/);
		return formatResponse(drive, parseInt(find[0]) * 1024);
	}

	var size = (drive.os == 'linux') ? '--block-size=1024' : '-k';
	drive.command('du ' + size + ' -s "' + drive.location + '"').then(process).then(promise.resolve).catch(function(e) {
		promise.reject(e);
	});

	return promise.promise;
}

exports = module.exports = Drive;
