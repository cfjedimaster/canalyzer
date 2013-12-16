define(function(require, exports, module) {

	var CommandManager          = brackets.getModule("command/CommandManager"),
		Menus                   = brackets.getModule("command/Menus"),
        PanelManager            = brackets.getModule("view/PanelManager"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        FileSystem              = brackets.getModule("filesystem/FileSystem"),
        FileUtils               = brackets.getModule("file/FileUtils"),
        ProjectManager			= brackets.getModule("project/ProjectManager"),
		AppInit                 = brackets.getModule("utils/AppInit");

    var EXT_EXECUTE = "canalyzer.execute";
    var panel;
    var panelHtml     = require("text!templates/panel.html");
    var featureHtml     = require("text!templates/featuretable.html");
    var $panelDom;
    var loaded = false;
    var data;
    var markers;
    var safeExtList = ["html","htm","css","js"];
    //cached file list - will need to ensure we update this
    var projectFileList;

    //What browsers we care about - yes this is opinionated - deal with it
    var browsers = ["ie","firefox","chrome","ios_saf","android"];

    //translate CanIUse status to English
    //https://github.com/Fyrd/caniuse/blob/master/Contributing.md
    function canIUseLabel(s) {
    	if(s === "y") return "Yes";
    	if(s === "p") return "No (Polyfill exits)";
    	if(s === "a") return "Partially";
    	if(s === "n") return "No";
    	if(s === "u") return "Unknown";
    	if(s === "x") return "Requires prefix";
    	return "";
    }

    //Given a path under a project, remove the project stuff to make it smaller
    function fixPath(s) {
    	return "/"+ s.replace(ProjectManager.getProjectRoot().fullPath,"");
    }

	function log(s) {
		console.log("[canalyzer] "+s);
	}

	/* removing for now...
	function disableListenForChanges() {
		log("stop listening for editor changes");
	}

	function listenForChanges() {
		log("start listening for editor changes");
	}
	*/

	function checkMarkers(str) {
		var matches = [];
		for(var i=0, len=markers.length; i<len; i++) {
			var marker = markers[i];
			var reg = new RegExp(marker.marker);
			if(reg.test(str)) {
				//log('yes we found a match for '+marker.marker);
				matches.push(marker);
			} 
		}
		return matches;
	}

	function renderResults(results) {
		if(!$.isEmptyObject(results)) {
			/*
			we need to massage the data into an array of
			feature | list of files (comma) | MinX 
			  MinX is the minimum version required for the feature
			  It is N items based on our preferred browsers
			*/
			console.dir(results);
			var dispArr = [];
			for(feature in results) {
				var row = {};
				//get the nice name of the feature
				row.title = data.data[feature].title;
				row.spec = data.data[feature].spec;
				row.desc = data.data[feature].description;
				//generate a file list - to do is remove path before project root so it is a bit smaller
				row.fileList = [];
				for(var i=0,len=results[feature].length;i<len;i++) {
					row.fileList.push(fixPath(results[feature][i].fullPath));
				}
				row.browsers = [];
				//Now for the browsers we care about, check min
				for(var i=0, len=browsers.length; i<len;i++) {
					/*
					this is the funky logic where we get the current version by
					taking all versions and hititng len-3
					*/
					var thisB = browsers[i];
					var currentV = data.agents[thisB].versions[data.agents[thisB].versions.length-3];
					var thisSupport = data.data[feature].stats[thisB][currentV];
					//log("b is "+thisB+ " currentV is "+currentV+" and supp is "+thisSupport);
					row.browsers.push(canIUseLabel(thisSupport));
				}

				dispArr.push(row);
				var s = Mustache.render(featureHtml,dispArr);
        		$(".canalyzer-panel .mainContent").html(s);

			}
			//console.dir(dispArr);
		} else {
			$(".canalyzer-panel .mainContent").html("Nothing relevant was found in your project.");
		}
	}

	function scanFiles() {
		var defs = [];
		var results = {};
		for(var i=0, len=projectFileList.length; i<len; i++) {
			defs.push(FileUtils.readAsText(projectFileList[i]));
		}

		$.when.apply($, defs).done(function() {
			//So, for each file we parse, we look for problem markers
			for(var i=0, len=arguments.length; i<len; i++) {
				var matches = checkMarkers(arguments[i][0]);
				if(matches.length > 0) {
					for(var x=0, len2=matches.length; x<len2; x++) {
						if(!(matches[x].feature in results)) {
							results[matches[x].feature] = [];
						}
						results[matches[x].feature].push(projectFileList[i]);
					}
				}
			}
			renderResults(results);
		});
	}

	function scanProject() {
		log("Check the project "+ProjectManager.getProjectRoot());
		var dirEntry = ProjectManager.getProjectRoot();

		function safeFilter(f,x) {
			var ext = f.name.split(".").pop();
			return safeExtList.indexOf(ext) >= 0;
		}

		if(!projectFileList) {
			ProjectManager.getAllFiles(safeFilter,false).done(function(files) {
				projectFileList=files;
				scanFiles();
			});
		} else {
			log('had a cached copy');
			scanFiles();
		}
	}

	function handleDisplayPanel() {
		if(panel.isVisible()) {
			panel.hide();
            CommandManager.get(EXT_EXECUTE).setChecked(false);
            //disableListenForChanges();
		} else {
			panel.show();
            CommandManager.get(EXT_EXECUTE).setChecked(true);

            //get data if we don't have it yet
            //disabled caching for 1.0
            if (1 || !loaded) {
                $(".canalyzer-panel .mainContent").html("Loading stuff - stand by and be patient.");

                var moduleDir = FileUtils.getNativeModuleDirectoryPath(module);
                var dataFile = FileSystem.getFileForPath(moduleDir + "/data.json");
                var markerFile = FileSystem.getFileForPath(moduleDir + "/markers.json");

				$.when(FileUtils.readAsText(dataFile),FileUtils.readAsText(markerFile))
					.done(function(caniusedata,markerdata) {
						data = JSON.parse(caniusedata[0]);
						markers = JSON.parse(markerdata[0]);
						$(".canalyzer-panel .mainContent").html("");
						scanProject();
						//listenForChanges();
					})
					.fail(function(error) {
						//Todo - datafile isn't right here
                        FileUtils.showFileOpenError(error, dataFile);
					});
            } else {
                scanProject();
                //listenForChanges();
            }

		}
	}

	AppInit.appReady(function () {

		log("canalyzer loaded.");

        ExtensionUtils.loadStyleSheet(module, "app.css");

        $panelDom = $(panelHtml);

        $('.close', $panelDom).click(function () {
            CommandManager.execute(EXT_EXECUTE);
        });

		CommandManager.register("Run Canalyzer!", EXT_EXECUTE, handleDisplayPanel);

		var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
		menu.addMenuItem(EXT_EXECUTE);

		panel = PanelManager.createBottomPanel(EXT_EXECUTE, $panelDom, 400);

	});

});