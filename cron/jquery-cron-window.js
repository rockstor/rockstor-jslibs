/*
 * jQuery cron_window
 * Extension for Shawn Chin jQuery cron plugin
 * http://shawnchin.github.com/jquery-cron
 *
 * Created by Mirko Arena for Rockstor BTRFS Storage System.
 * Licensed under the GPL Version 2 license.
 *
 * Requires:
 * - jQuery
 *
 * Usage:
 *  (JS)
 *
 *  // initialise like this
 *  var c = $('#cron_window').cron_window();
 *
 *  (HTML)
 *  <div id='cron_window'></div>
 *
 * Currently crated task execution windows:
 *
 * - Exec win format : Hour_start-Min_start-Hour_stop-Min_stop-Dow_start-Dow_stop
 * - Always          : *-*-*-*-*-*
 * - Day Window      : *-*-*-*-?-?
 * - Time Window     : ?-?-?-?-*-*
 * - Custom Window   : ?-?-?-?-?-?
 */
(function($) {

    var defaults = {
        initial : "*-*-*-*-*-*",
        timeMinuteOpts : {
            minWidth  : 100, // only applies if columns and itemWidth not set
            itemWidth : 10,
            columns   : 5,
            rows      : undefined,
            title     : "Time: Minute"
        },
        timeHourOpts : {
            minWidth  : 100, // only applies if columns and itemWidth not set
            itemWidth : 20,
            columns   : 2,
            rows      : undefined,
            title     : "Time: Hour"
        },
        dowOpts : {
            minWidth  : 100, // only applies if columns and itemWidth not set
            itemWidth : undefined,
            columns   : undefined,
            rows      : undefined,
            title     : undefined
        },
        effectOpts : {
            openSpeed      : 400,
            closeSpeed     : 400,
            openEffect     : "slide",
            closeEffect    : "slide",
            hideOnMouseOut : true
        },
        url_set : undefined,
        customValues : undefined,
        onChange: undefined,
        useGentleSelect: true
    };

    // - functions to render options fields - needed mods to perform start < stop checks

    // MINUTES
    var str_opt_mih = "";
    for (var i = 0; i < 60; i++) {
        var j = (i < 10)? "0":"";
        str_opt_mih += "<option value='"+i+"'>" + j +  i + "</option>\n";
    }

    // HOURS
    var str_opt_hid = "";
    for (var i = 0; i < 24; i++) {
        var j = (i < 10)? "0":"";
        str_opt_hid += "<option value='"+i+"'>" + j + i + "</option>\n";
    }

    // WEEK DAYS
    var str_opt_dow = "";
    var days = ["Mon", "Tue", "Wed", "Thu",
                "Fri", "Sat", "Sun"];
    for (var i = 0; i < days.length; i++) {
        str_opt_dow += "<option value='"+i+"'>" + days[i] + "</option>\n";
    }

    // options for time windows
    var str_opt_timewindow = "";
    var windows = ["always", "day", "time", "custom"];
	var windows_label = ["Run always - no limitations", "Week days filter", "Time filter", "Custom settings"]; // label for windows - used only for beautify text
    for (var i = 0; i < windows.length; i++) {
        str_opt_timewindow += "<option value='"+windows[i]+"'>" + windows_label[i] + "</option>\n";
    }

    // display matrix
    var toDisplay = {
		"always" : [],                         //don't show any block - always execute task *-*-*-*-*-* 
		"day"    : ["days"],
		"time"   : ["time-start", "time-stop"],
		"custom" : ["time-start", "time-stop", "days"]
    };

    var combinations = {                               // from cron plugin changed to match exec windows (6 chars)
		"always" : /^(\*\-){5}\*$/,                    // "*-*-*-*-*-*"
		"day"    : /^(\*\-){4}\d{1,2}\-\d{1,2}$/,      // "*-*-*-*-?-?"
		"time"   : /^(\d{1,2}\-){4},\*\-\*$/,          // "?-?-?-?-*-*"
		"custom" : /^(\d{1,2}\-){5}\d{1,2}$/           // "?-?-?-?-?-?"
    };

    // --------- private funcs ---------
    function defined(obj) {
        if (typeof obj == "undefined") { return false; }
        else { return true; }
    }

    function undefinedOrObject(obj) {
        return (!defined(obj) || typeof obj == "object")
    }

    function getWindowType(window_str, opts) {
        // if customValues defined, check for matches there first
        if (defined(opts.customValues)) {
            for (key in opts.customValues) {
                if (window == opts.customValues[key]) { return key; }
            }
        }

        // check format of initial day-time window
        var valid_window = /^((\d{1,2}|\*)\-){5}(\d{1,2}|\*)$/
        if (typeof window_str != "string" || !valid_window.test(window_str)) {
            $.error("cron: invalid initial value");
            return undefined;
        }

        // check window execution value
        var d = window_str.split("-");
        //           Hour_start-Min_start-Hour_stop-Min_stop-Dow_start-Dow_stop
        var minval = [ 0,  0,  0,  0,  0,  0]; // min-max val modified to match window ranges
        var maxval = [23, 59, 23, 59,  6,  6];
        for (var i = 0; i < d.length; i++) {
            if (d[i] == "*") continue;
            var v = parseInt(d[i]);
            if (defined(v) && v <= maxval[i] && v >= minval[i]) continue;

            $.error("Cron window: invalid value found (col "+(i+1)+") in " + o.initial);
            return undefined;
        }

        // determine combination
        for (var t in combinations) {
            if (combinations[t].test(window_str)) { return t; }
        }

        // unknown combination
        $.error("Cron window: valid but unsupported window format. sorry.");
        return undefined;
    }

    function hasError(c, o) {
        if (!defined(getWindowType(o.initial, o))) { return true; }
        if (!undefinedOrObject(o.customValues)) { return true; }

        // ensure that customValues keys do not coincide with existing fields
        if (defined(o.customValues)) {
            for (key in o.customValues) {
                if (combinations.hasOwnProperty(key)) {
                    $.error("Cron window: reserved keyword '" + key +
                            "' should not be used as customValues key.");
                    return true;
                }
            }
        }

        return false;
    }

    function getCurrentValue(c) {
        var b = c.data("block");
        var hour_start = hour_stop = min_start = min_stop = day_start = day_stop = "*";
        var selectedTimeWindow = b["rangewindow"].find("select").val();
        switch (selectedTimeWindow) {
            case "always":
				break;
				
			case "day":
				day_start = b["days"].find("select.cron-days-start").val();
				day_stop = b["days"].find("select.cron-days-stop").val();
				break;
				
			case "time":
				hour_start = b["time-start"].find("select.cron-time-hour-start").val();
				min_start = b["time-start"].find("select.cron-time-min-start").val();
				hour_stop = b["time-stop"].find("select.cron-time-hour-stop").val();
				min_stop = b["time-stop"].find("select.cron-time-min-stop").val();
				break;
				
			case "custom":
				hour_start = b["time-start"].find("select.cron-time-hour-start").val();
				min_start = b["time-start"].find("select.cron-time-min-start").val();
				hour_stop = b["time-stop"].find("select.cron-time-hour-stop").val();
				min_stop = b["time-stop"].find("select.cron-time-min-stop").val();
				day_start = b["days"].find("select.cron-days-start").val();
				day_stop = b["days"].find("select.cron-days-stop").val();
				break;

            default:
                // we assume this only happens when customValues is set
                return selectedTimeWindow;
        }
        return [hour_start, hour_stop, min_start, min_stop, day_start, day_stop].join("-");
    }

    // -------------------  PUBLIC METHODS -----------------

    var methods = {
        init : function(opts) {

            // init options
            var options = opts ? opts : {}; /* default to empty obj */
            var o = $.extend([], defaults, options);
            var eo = $.extend({}, defaults.effectOpts, options.effectOpts);
            $.extend(o, {
                timeMinuteOpts : $.extend({}, defaults.timeMinuteOpts, eo, options.timeMinuteOpts),
                timeHourOpts   : $.extend({}, defaults.timeHourOpts, eo, options.timeHourOpts),
                dowOpts        : $.extend({}, defaults.dowOpts, eo, options.dowOpts)
            });

            // error checking
            if (hasError(this, o)) { return this; }

            // ---- define select boxes in the right order -----

            var block = [], custom_windows = "", cv = o.customValues;
            if (defined(cv)) { // prepend custom values if specified
                for (var key in cv) {
                    custom_windows += "<option value='" + cv[key] + "'>" + key + "</option>\n";
                }
            }

            block["rangewindow"] = $("<span class='cron-period'>"
                    + "<select name='cron-window'>" + custom_windows
                    + str_opt_timewindow + "</select> </span>")
                .appendTo(this)
                .data("root", this);

            var select = block["rangewindow"].find("select");
            select.bind("change.cron", event_handlers.timewindowChanged)
                  .data("root", this);
            if (o.useGentleSelect) select.gentleSelect(eo);

            block["time-start"] = $("<span class='cron-block cron-block-time'>"
                    + " from <select name='cron-time-hour-start' class='cron-time-hour-start'>" + str_opt_hid
                    + "</select>:<select name='cron-time-min-start' class='cron-time-min-start'>" + str_opt_mih
                    + " </span>")
                .appendTo(this)
                .data("root", this);

            select = block["time-start"].find("select.cron-time-hour-start");
            select.bind("change", event_handlers.timedaysChanged)
                  .data("root", this);
            if (o.useGentleSelect) select.gentleSelect(o.timeHourOpts);
            select = block["time-start"].find("select.cron-time-min-start");
            select.bind("change", event_handlers.timedaysChanged)
                  .data("root", this);
            if (o.useGentleSelect) select.gentleSelect(o.timeMinuteOpts);

            block["time-stop"] = $("<span class='cron-block cron-block-time'>"
                    + " to <select name='cron-time-hour-stop' class='cron-time-hour-stop'>" + str_opt_hid
                    + "</select>:<select name='cron-time-min-stop' class='cron-time-min-stop'>" + str_opt_mih
                    + " </span>")
                .appendTo(this)
                .data("root", this);

            select = block["time-stop"].find("select.cron-time-hour-stop").data("root", this);
            if (o.useGentleSelect) select.gentleSelect(o.timeHourOpts);
            select = block["time-stop"].find("select.cron-time-min-stop").data("root", this);
            if (o.useGentleSelect) select.gentleSelect(o.timeMinuteOpts);
			
            block["days"] = $("<span class='cron-block cron-block-dow'>"
                    + " on <select name='cron-days-start' class='cron-days-start'>" + str_opt_dow
                    + "</select> to <select name='cron-days-stop' class='cron-days-stop'>" + str_opt_dow + " </span>")
                .appendTo(this)
                .data("root", this);

            select = block["days"].find("select.cron-days-start");
            select.bind("change", event_handlers.timedaysChanged)
                  .data("root", this);
            if (o.useGentleSelect) select.gentleSelect(o.dowOpts);
            select = block["days"].find("select.cron-days-stop").data("root", this);
            if (o.useGentleSelect) select.gentleSelect(o.dowOpts);
			
            this.data("options", o).data("block", block); // store options and block pointer
            this.data("current_value", o.initial); // remember base value to detect changes

            return methods["value"].call(this, o.initial); // set initial value
        },

        value : function(cron_str) {
            
            if (!cron_str) { return getCurrentValue(this); } //return current value

            var o = this.data('options');
            var block = this.data("block");
            var useGentleSelect = o.useGentleSelect;
            var t = getWindowType(cron_str, o);
            
            if (!defined(t)) { return false; }
            
            if (defined(o.customValues) && o.customValues.hasOwnProperty(t)) {
                t = o.customValues[t];
            } else {
                var d = cron_str.split("-");
                var v = {
                    "hour_start" : d[0],
                    "min_start"  : d[1],
                    "hour_start" : d[2],
                    "hour_stop"  : d[3],
                    "day_start"  : d[4],
					"day_stop"   : d[5]
                };

                // update appropriate select boxes
                var targets = toDisplay[t];
                for (var i = 0; i < targets.length; i++) {
                    var tgt = targets[i];
                    if (tgt == "time-start") {
                        var btgt = block[tgt].find("select.cron-time-hour-start").val(v["hour_start"]);
                        if (useGentleSelect) btgt.gentleSelect("update");
                        btgt = block[tgt].find("select.cron-time-min-start").val(v["min_start"]);
                        if (useGentleSelect) btgt.gentleSelect("update");
                    }
                    if (tgt == "time-stop") {
                        var btgt = block[tgt].find("select.cron-time-hour-stop").val(v["hour_stop"]);
                        if (useGentleSelect) btgt.gentleSelect("update");
                        btgt = block[tgt].find("select.cron-time-min-stop").val(v["min_stop"]);
                        if (useGentleSelect) btgt.gentleSelect("update");
                    }
                    if (tgt == "days") {
                        var btgt = block[tgt].find("select.cron-days-start").val(v["day_start"]);
                        if (useGentleSelect) btgt.gentleSelect("update");
                        btgt = block[tgt].find("select.cron-days-stop").val(v["day_stop"]);
                        if (useGentleSelect) btgt.gentleSelect("update");
                    }				
                }
            }
            // trigger change event
            var bp = block["rangewindow"].find("select").val(t);
            if (useGentleSelect) bp.gentleSelect("update");
            bp.trigger("change");

            return this;
        }

    };

    var event_handlers = {
        timewindowChanged : function() {
            var root = $(this).data("root");
            var block = root.data("block"),
                opt = root.data("options");
            var period = $(this).val();

            root.find("span.cron-block").hide(); // first, hide all blocks
            if (toDisplay.hasOwnProperty(period)) { // not custom value
                var b = toDisplay[$(this).val()];
                for (var i = 0; i < b.length; i++) {
                    block[b[i]].show();
                }
            }
        },
        timedaysChanged : function() {   // on start hour time day changed apply values to stop fields
            var root = $(this).data("root");
            var block = root.data("block"),
                opt = root.data("options");
	    var stop_hour = stop_min = stop_day = 0;
	    var listen_changes = $(this).val();

        if ($(this).is(".cron-days-start")) { // set stop day >= start day
                stop_day = parseInt($(this).val());
                var daystop = block["days"].find("select.cron-days-stop").val(stop_day);
                daystop.gentleSelect("update");
                daystop.trigger("change");
            }

	if ($(this).is(".cron-time-hour-start")) { // set stop hour >= start hour and checks next hour prev hour
		stop_hour = parseInt($(this).val());
                var stop_min = parseInt(block["time-start"].find("select.cron-time-min-start").val());
		if (stop_min==59) { stop_hour++;  }
		var hourstop = block["time-stop"].find("select.cron-time-hour-stop").val(stop_hour);
                hourstop.gentleSelect("update");
                hourstop.trigger("change");
            }

        if ($(this).is(".cron-time-min-start")) { // set stop min > start min - if min = 59 move to hour+1 min=0 and check for inversion
                stop_min = parseInt($(this).val());
		var stop_hour = parseInt(block["time-start"].find("select.cron-time-hour-start").val());
                if (stop_min<59) {
	            	stop_min++;
	        } else {
			stop_min=0;
			stop_hour += (stop_hour < 23) ? 1 : 0;
		}
		var minstop = block["time-stop"].find("select.cron-time-min-stop").val(stop_min);
            	minstop.gentleSelect("update");
            	minstop.trigger("change");
            	var hourstop = block["time-stop"].find("select.cron-time-hour-stop").val(stop_hour);
            	hourstop.gentleSelect("update");
            	hourstop.trigger("change");
            }
        }
    };

    $.fn.cron_window = function(method) {
        if (methods[method]) {
            return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method === 'object' || ! method) {
            return methods.init.apply(this, arguments);
        } else {
            $.error( 'Method ' +  method + ' does not exist on jQuery.cron' );
        }
    };

})(jQuery);
