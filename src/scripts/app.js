// ------------------------------------------------------------------------------
// ----- NY QW Mapper ----------------------------------------------------------
// ------------------------------------------------------------------------------

// copyright:   2016 Martyn Smith - USGS NY WSC

// authors:  Martyn J. Smith - USGS NY WSC

// purpose:  Web Mapping interface for NY QW data

// updates:
// 12.02.2016 mjs - Created

//config variables
var MapX = '-76.2';
var MapY = '42.7';
var map;
var sitesGeoJSON;  //master geoJSON object of universe of sitesGeoJSON
var sitesLayer;  //leaflet feature group representing current filtered set of sites
var baseMapLayer, basemapLayerLabels;
var GeoFilterGroupList = [
	{layerID: "1", layerName: "County", dropDownID: "CNTYC"},
	{layerID: "2", layerName: "Major River Basin", dropDownID: "MAJRIVBAS"},
	{layerID: "3", layerName: "Hydrologic Unit", dropDownID: "HUNIT"},
	{layerID: "4", layerName: "Well Use", dropDownID: "WELLUSE"},
	{layerID: "5", layerName: "Well Type", dropDownID: "WELLCOMPIN"}	
];
var geojsonMarkerOptions = {
	radius: 4,
	fillColor: '#ff7800',
	color: '#000',
	weight: 1,
	opacity: 1,
	fillOpacity: 0.8
};
var geoFilterFlag;
var parentArray = [];
var CSVurl = './data.csv';
var CSVdata;

var layerList = [
	{layerID: "1", layerName: "NY WSC Sub-district", outFields: ["subdist","FID"],dropDownID: "WSCsubDist"},
	{layerID: "2", layerName: "Senate District", outFields: ["NAMELSAD","FID","Rep_Name"],dropDownID: "SenateDist"},
	{layerID: "3", layerName: "Assembly District", outFields: ["NAMELSAD","FID","AD_Name"], dropDownID: "AssemDist"},
	{layerID: "4", layerName: "Congressional District",	outFields: ["NAMELSAD","FID","CD_Name"], dropDownID: "CongDist"},
	{layerID: "5", layerName: "County",	outFields: ["County_Nam","FID"],dropDownID: "County"},
	{layerID: "6", layerName: "Hydrologic Unit",	outFields: ["HUC_8","FID","HU_8_Name"],	dropDownID: "HUC8"}	
];

toastr.options = {
  'positionClass': 'toast-bottom-right',
};

if (process.env.NODE_ENV !== 'production') {
  require('../index.html');
}

var data = require('./data.js');

//instantiate map
$( document ).ready(function() {
	console.log('Application Information: ' + process.env.NODE_ENV + ' ' + 'version ' + VERSION);
	$('#appVersion').html('Application Information: ' + process.env.NODE_ENV + ' ' + 'version ' + VERSION);

	//create map
	map = L.map('mapDiv',{zoomControl: false});

	L.Icon.Default.imagePath = './images/';

	//add zoom control with your options
	L.control.zoom({position:'topright'}).addTo(map);  
	L.control.scale().addTo(map);

	//basemap
	layer= L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
		attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
		maxZoom: 16
	}).addTo(map);

	//set initial view
	map.setView([MapY, MapX], 7);
		
	//define layers
	sitesLayer = L.featureGroup().addTo(map);

	createGeoFilterGroups(GeoFilterGroupList);
	populateConstituentGroupFilters();
	//loadCountyLookup();
	//parseBaseLayers();
	//loadSites();
	
	/*  START EVENT HANDLERS */
	$('#mobile-main-menu').click(function() {
		$('body').toggleClass('isOpenMenu');
	});

	$('.basemapBtn').click(function() {
		$('.basemapBtn').removeClass('slick-btn-selection');
		$(this).addClass('slick-btn-selection');
		var baseMap = this.id.replace('btn','');
		setBasemap(baseMap);
	});

	$('#loadSites').click(function() {
		loadSites();
	});

	$('#resetView').click(function() {
		resetView();
	});

	$('#resetFilters').click(function() {
		resetFilters();
	});

	$('#aboutButton').click(function() {
		$('#aboutModal').modal('show');
	});	

	$('#getQWdata').click(function() {
		getQWdata();
	});	

	$('#exportGeoJSON').click(function() {
		downloadGeoJSON();
	});	

	$('#exportKML').click(function() {
		downloadKML();
	});	

	$('#geoFilterSelect').on('changed.bs.select', function (event, clickedIndex, newValue, oldValue) {

		var parentSelectID = $(event.target).attr('id');
		var selectArray = $(event.target).find('option:selected');
		var singleSelectCount = selectArray.length;
		var currentSelected = $(event.target).find('option')[clickedIndex];

		//console.log('current selected: ', currentSelected, parentSelectID )

		if (singleSelectCount === 0) {
			//console.log('here',parentSelectID,parentArray);
			var index = parentArray.indexOf(parentSelectID);
			if (index > -1) {
				parentArray.splice(index, 1);
			}
		}

		var layerID,value,name;

		//if operation is a deselect, get remaining selected options
		if (newValue === false) {
			layerID = $(event.target).find('option:selected').attr('layerID');
			value = $(event.target).find('option:selected').attr('value');
			name = $(event.target).find('option:selected').text();
		}

		//otherwise make a new selection
		else {
			layerID = $(currentSelected).attr('layerID');
			value = $(currentSelected).attr('value');
			name = $(currentSelected).text();
		}

		//console.log('GeoFilter selected: ',name,value,layerID,parentSelectID,singleSelectCount);

		//find how many different selects have options selected
		$.each($('#geoFilterSelect').find('option:selected'), function (index,value) {
			var parent = $(value).parent().attr('id');
			if (parentArray.indexOf(parent) === -1) {
				parentArray.push(parent);
			}
		});

		//console.log('geoselect with selections in:',parentArray);
		
		//if all in a single select are unselected, reset filters
		if (singleSelectCount === 0 && parentArray.length === 0) {
			toastr.info('You just unselected all options, resetting filters', 'Info');
			resetView();
			return;
		}

		//otherwise do query
		else {
			loadSites({selectName:parentSelectID, optionValue:value, optionName:name})
		}
	});

	/*  END EVENT HANDLERS */
});



// function loadCountyLookup() {
// 	$.getJSON('./countyCodesNY.json', function(data) {
// 		countyLookup = data;

// 		loadCSV(CSVurl);
// 		loadConstituentGroupLookup();
// 	});
// }

// function loadConstituentGroupLookup() {
// 	$.getJSON('./constituentGroupLookup.json', function(data) {
// 		constituentGroupList = data;
// 		//console.log('loadConstituentGroupLookup:',constituentGroupList)
		
// 		//make sure counties are loaded before sites are
// 		loadConstituentPcodeLookup();
		
// 	});
// }

// function loadConstituentPcodeLookup() {
// 	$.getJSON('./pCodeLookup.json', function(data) {
// 		pCodeLookup = data;
// 		//console.log('pcode lookup:',pCodeLookup)
		
// 		//make sure counties are loaded before sites are
// 		populateConstituentGroupFilters();
		
// 	});
// }

function populateConstituentGroupFilters() {
	//console.log('here1');
	$.each(data.constituentGroupList , function( constituentGroup, valueList ) {
		//console.log('here',constituentGroup, valueList)

		var dropDownName = camelize(constituentGroup) + "-select"
		//create dropdown for this constituent
		$("#constituentFilterSelect").append("<select id='" + dropDownName  + "' class='selectpicker geoFilterSelect' multiple data-selected-text-format='count' data-dropup-auto='false' title='" + constituentGroup + "'></select>");

		//loop over valueList
		$.each(valueList, function( index, constituentPcode ) {

			//loop over pcode lookup
			$.each(data.pCodeLookup, function( text, pcode ) {
				if (pcode === constituentPcode) {
					//console.log('match found',text, pcode)
					addFilterOption(constituentPcode, pcode + ' | ' + text, '#' + dropDownName);
				}
			});
		});
	});
}

function loadSites(filterInfo) {

	toastr.info('Drawing GeoJSON...', {timeOut: 0});
	// $('#filtersPanel').collapse("toggle");

	//clear current display layer
	sitesLayer.clearLayers();

	var geoJSONlayer = L.geoJson(null, {
		//optional filter input
		filter: function(feature, layer) {
			if (filterInfo && filterInfo.selectName === 'CNTYC-select') return feature.properties.CNTYC === filterInfo.optionValue;
			if (filterInfo && filterInfo.selectName === 'MAJRIVBAS-select') return feature.properties.MAJRIVBAS === filterInfo.optionValue;
			if (filterInfo && filterInfo.selectName === 'HUNIT-select') return feature.properties.HUNIT.substring(0,8) === filterInfo.optionValue;
			if (filterInfo && filterInfo.selectName === 'WELLUSE-select') return feature.properties.WELLUSE === filterInfo.optionValue;
			if (filterInfo && filterInfo.selectName === 'WELLCOMPIN-select') return feature.properties.WELLCOMPIN === filterInfo.optionValue;
			return true;
		},
		pointToLayer: function (feature, latlng) {
			return L.circleMarker(latlng, geojsonMarkerOptions);
		},
		onEachFeature: function (feature, layer) {
			populateGeoFilters(feature);
		}
	});

	var geoJSON = omnivore.csv.parse(CSVdata, null, geoJSONlayer).addTo(map);
	sitesLayer.addLayer(geoJSON);

	

	//needs a setTimeout for geoJSON to finish loading
	setTimeout(function(){ 
		map.fitBounds(sitesLayer.getBounds()); 
		console.log(map.getCenter(),map.getZoom())
	}, 100);
	
	toastr.clear();
}

function loadCSV(url) {
	$.ajax({
		type : "GET",
		url : url,
		dataType : "text",
		async : false,
		success : function(data){
			//console.log('csv',data)
			CSVdata = data;
			loadSites();
		}
	});
}

function populateGeoFilters(feature) {

	//add to select dropdown
	$.each(GeoFilterGroupList, function(index, filter) {

		//populate the dropdowns
		var elementName = '#' + filter.dropDownID + '-select';

		//have to use callback function for county because a lookup is needed
		if (filter.layerName === 'County') { getCountyNameFromFIPS(feature.properties.CNTYC, elementName, addFilterOption)};

		//for others just add the filter option
		if (filter.layerName === 'Major River Basin') {addFilterOption(feature.properties.MAJRIVBAS, feature.properties.MAJRIVBAS, elementName)};
		if (filter.layerName === 'Hydrologic Unit') {addFilterOption(feature.properties.HUNIT.substring(0,8), feature.properties.HUNIT.substring(0,8), elementName)};
		if (filter.layerName === 'Well Use') {addFilterOption(feature.properties.WELLUSE, feature.properties.WELLUSE, elementName)};
		if (filter.layerName === 'Well Type') {addFilterOption(feature.properties.WELLCOMPIN, feature.properties.WELLCOMPIN, elementName)};

		//console.log('here', feature.properties.STAID,filter.layerName,code)
	});
}

function addFilterOption(code, text, elementName) {
	//console.log('here3', code, elementName);
	//add it if it doesn't exist
	if (code && code !== 'na' && $(elementName + ' option[value="' + code + '"]').length == 0) {
		//console.log('adding an option for:',elementName,code)
		$(elementName).append($('<option></option>').attr('value',code).text(text));
		$('.selectpicker').selectpicker('refresh');
	}
}

function getCountyNameFromFIPS(FIPScode, elementName, callback) {
	//console.log('here2');

	//from here: https://www.census.gov/geo/reference/codes/cou.html
	//then converted to json: https://www.csvjson.com/csv2json
	$.each(data.countyLookup, function( index, county ) {
		if (county.CountyCd === FIPScode) {
			//console.log('in county lookup:',FIPScode,county.CountyCd);
			callback(FIPScode, county.CountyName, elementName);
		}
	});
		
}

function createGeoFilterGroups(list) {
	$.each(list, function(index, filter) {

		//create dropdown menus
		$("#geoFilterSelect").append("<select id='" + filter.dropDownID + "-select' class='selectpicker geoFilterSelect' multiple data-selected-text-format='count' data-dropup-auto='false' title='" + filter.layerName + "'></select>");
	});

	loadCSV(CSVurl);
}

function downloadGeoJSON() {

	//for some reason the leaflet toGeoJSON wraps the geojson in a second feature collection
	if (sitesLayer.toGeoJSON().features[0]) {
		var GeoJSON = JSON.stringify(sitesLayer.toGeoJSON().features[0]);
		var filename = 'data.geojson';
		downloadFile(GeoJSON,filename)
	}
	else {
		toastr.error('Error', 'No sites to export')
	}
}

function downloadKML() {
	//https://github.com/mapbox/tokml
	//https://gis.stackexchange.com/questions/159344/export-to-kml-option-using-leaflet
	if (sitesLayer.toGeoJSON().features[0]) {
		var GeoJSON = sitesLayer.toGeoJSON().features[0];
		var kml = tokml(GeoJSON);
		var filename = 'data.kml';
		downloadFile(kml,filename);
	}
	else {
		toastr.error('Error', 'No sites to export')
	}
}

function downloadFile(data,filename) {
	var blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
	if (navigator.msSaveBlob) { // IE 10+
		navigator.msSaveBlob(blob, filename);
	} else {
		var link = document.createElement('a');
		var url = URL.createObjectURL(blob);
		if (link.download !== undefined) { // feature detection
			// Browsers that support HTML5 download attribute
			link.setAttribute('href', url);
			link.setAttribute('download', filename);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
		else {
			window.open(url);
		}
	}
}

function USGSrdb2JSON(tsv){

	var lines=tsv.split(/\r?\n/);
	var result = [];
	var headers;

	$.each(lines, function( index, line ) {
		var obj = {};
		if(line[0] != '#') {		
			var currentline=line.split('\t');

			if (currentline[0] === 'agency_cd') {
				headers=currentline;
			}
			if (currentline[0] !== '5s' && currentline[0] !== 'agency_cd') {
				//console.log(currentline)

				for(var j=0;j<headers.length;j++){
					obj[headers[j]] = currentline[j];
				}

				result.push(obj) 
			}
		}
	});
  
	//return result; //JavaScript object
	return result; //JSON
}

function setBasemap(baseMap) {

	switch (baseMap) {
		case 'Streets': baseMap = 'Streets'; break;
		case 'Satellite': baseMap = 'Imagery'; break;
		case 'Topo': baseMap = 'Topographic'; break;
		case 'Terrain': baseMap = 'Terrain'; break;
		case 'Gray': baseMap = 'Gray'; break;
		case 'NatGeo': baseMap = 'NationalGeographic'; break;
	}

	if (baseMapLayer) 	map.removeLayer(baseMapLayer);
	baseMapLayer = L.esri.basemapLayer(baseMap);
	map.addLayer(baseMapLayer);
	if (basemapLayerLabels) map.removeLayer(basemapLayerLabels);
	if (baseMap === 'Gray' || baseMap === 'Imagery' || baseMap === 'Terrain') {
		basemapLayerLabels = L.esri.basemapLayer(baseMap + 'Labels');
		map.addLayer(basemapLayerLabels);
	}
}

function resetFilters() {
	$('.selectpicker').selectpicker('deselectAll');

	parentArray = [];
}

function resetView() {

	//clear any selection graphics
	loadSites();

	//reset filters
	resetFilters();

	//reset view
	map.setView([MapY, MapX], 7);
}

function camelize(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(letter, index) {
        return index == 0 ? letter.toLowerCase() : letter.toUpperCase();
    }).replace(/\s+/g, '');
}