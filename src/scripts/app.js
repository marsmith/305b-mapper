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
var masterGeoJSON,curGeoJSONlayer;
var sitesLayer;  //leaflet feature group representing current filtered set of sites
var baseMapLayer, basemapLayerLabels;
var visibleLayers = [];
var identifiedFeature;
var filterSelections = [];
var popupItems = ['SNAME','STAID','MAJRIVBAS','WELLUSE','WELLCOMPIN','CNTY','GUNIT','HUNIT'];
var GeoFilterGroupList = [
	{layerName: "County", dropDownID: "CNTY"},
	{layerName: "Major River Basin", dropDownID: "MAJRIVBAS"},
	{layerName: "Hydrologic Unit", dropDownID: "HUC8"},
	{layerName: "Well Use", dropDownID: "WELLUSE"},
	{layerName: "Well Type", dropDownID: "WELLCOMPIN"},
	{layerName: "Congressional District", dropDownID: "CONGDIST"},
	{layerName: "Senate District", dropDownID: "SENDIST"},
	{layerName: "Assembly District", dropDownID: "ASSEMDIST"},
	{layerName: "NY WSC Sub-district", dropDownID: "NYWSCDIST"}
];

var layerList = [
	{layerID: "1", layerName: "NY WSC Sub-district", outFields: ["subdist","FID"],dropDownID: "WSCsubDist"},
	{layerID: "2", layerName: "Senate District", outFields: ["NAMELSAD","FID","Rep_Name"],dropDownID: "SenateDist"},
	{layerID: "3", layerName: "Assembly District", outFields: ["NAMELSAD","FID","AD_Name"], dropDownID: "AssemDist"},
	{layerID: "4", layerName: "Congressional District",	outFields: ["NAMELSAD","FID","CD_Name"], dropDownID: "CongDist"},
	{layerID: "5", layerName: "County",	outFields: ["County_Nam","FID"],dropDownID: "County"},
	{layerID: "6",layerName: "Hydrologic Unit",	outFields: ["HUC_8","FID","HU_8_Name"],	dropDownID: "HUC8"}	
];

var mapServerDetails =  {
	"url": "https://www.sciencebase.gov/arcgis/rest/services/Catalog/56ba63bae4b08d617f6490d2/MapServer",
	"layers": [1,2,3,4,5,6], 
	"visible": false, 
	"opacity": 0.8,
}

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

	//create site/location filters, sites loaded from there
	createGeoFilterGroups(GeoFilterGroupList);

	//create constituent dropdowns
	populateConstituentGroupFilters();

	//add map layers
	parseBaseLayers();
	
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

	$('#showConstituentFilterSelect').click(function() {
		$('#showConstituentFilterSelect').hide();
		$('#geoFilterSelect').hide();
		$('#constituentFilterSelect').show();
	});	

	$('#exportGeoJSON').click(function() {
		downloadGeoJSON();
	});	

	$('#exportKML').click(function() {
		downloadKML();
	});	

	$('#exportCSV').click(function() {
		downloadCSV();
	});	

	$('#geoFilterSelect').on('changed.bs.select', function (event, clickedIndex, newValue, oldValue) {

		var parentSelectID = $(event.target).attr('id');
		var parentSelect = parentSelectID.replace('-select','')
		var selectArray = $(event.target).find('option:selected');
		var singleSelectCount = selectArray.length;
		var currentSelected = $(event.target).find('option')[clickedIndex];
		var	value = $(currentSelected).attr('value');
		var	name = $(currentSelected).text();

		if (singleSelectCount === 0) {
			var index = parentArray.indexOf(parentSelectID);
			if (index > -1) {
				parentArray.splice(index, 1);
			}
		}

		//find how many different selects have options selected
		$.each($('#geoFilterSelect').find('option:selected'), function (index,value) {
			var parent = $(value).parent().attr('id');
			if (parentArray.indexOf(parent) === -1) {
				parentArray.push(parent);
			}
		});

		//console.log('here1',selectArray.length,parentArray.length)

		//if operation is a deselect, get remaining selected options
		if (newValue === false) {
			
			console.log('Removing the filter:',parentSelect,value)
			for (i = 0; i < filterSelections.length; i++) { 
				if (filterSelections[i].selectName == parentSelect && filterSelections[i].optionValue == value) {
					//console.log('found something to remove')
					filterSelections.splice(i, 1);
				}
			}
		}

		//assume new selection
		else {
			var filterSelect = {selectName:parentSelect, optionValue:value};
			filterSelections.push(filterSelect);
		}

		//if all in a single select are unselected, reset filters
		if (singleSelectCount === 0 && parentArray.length === 0) {
			toastr.info('You just unselected all options, resetting filters', 'Info');
			resetView();
			return;
		}

		//otherwise do query
		else {
			toastr.info('Querying sites...', {timeOut: 0});
			//console.log('doing query',filterSelections)

			//if multiple parent dropdowns in use, assume conditional 'AND' (remove sites from subset)
			if (parentArray.length > 1) {
				loadSites(curGeoJSONlayer.toGeoJSON(),[filterSelect]);
			}

			//otherwise add sites from master, simulating conditional 'OR'
			else {
				loadSites(masterGeoJSON,filterSelections);
			}			
		}
	});

	$('#constituentFilterSelect').on('changed.bs.select', function (event, clickedIndex, newValue, oldValue) {
		console.log('here5')
		var parentSelectID = $(event.target).attr('id');
		var parentSelect = parentSelectID.replace('-select','')
		var value = $(event.target).find('option:selected').attr('value');
		var	name = $(event.target).find('option:selected').text();
		var filterSelect = {selectName:parentSelect, optionValue:value};

		 loadSites(curGeoJSONlayer.toGeoJSON(), [filterSelect]);
	});

	//set up click listener for map querying
	map.on('click', function (e) {
		if (visibleLayers.length > 0) {
			mapServer.identify().on(map).at(e.latlng).layers("visible:" + visibleLayers[0]).run(function(error, featureCollection){
			  if (featureCollection.features.length > 0) {
				$.each(featureCollection.features, function (index,value) {
	
					if (map.hasLayer(identifiedFeature)) map.removeLayer(identifiedFeature);
					identifiedFeature = L.geoJson(value).addTo(map)
					
					$.each(layerList, function (index, layerInfo) {
						var popupContent = '<h5>' + layerInfo.layerName + '</h5>';
						
						if (visibleLayers[0] == layerInfo.layerID) {
							$.each(value.properties, function (key, field) {
								if (layerInfo.outFields.indexOf(key) != -1) {								
									if (key != "FID") popupContent += '<strong>' + field + '</strong></br>';
								}
							});
							
							popup = L.popup()
							.setLatLng(e.latlng)
							.setContent(popupContent)
							.openOn(map);
						}
					});
				});
			  }
			  else {
				//pane.innerHTML = 'No features identified.';
			  }
			});
		}
	});	

	//click listener for regular button
	$('#baseLayerToggles').on("click", '.layerToggle', function(e) {
		
		var layerID = $(this).attr('value');
		var divID = $(this).attr('id');
		
		//clear all check marks
		$('.mapLayerBtn').removeClass('slick-btn-selection');
						
		//remove any selection
		if (map.hasLayer(identifiedFeature)) map.removeLayer(identifiedFeature);						
		
		//layer toggle
		console.log('current visible layers: ', visibleLayers);
		
		//if layer is already on the map
		if (visibleLayers == layerID) {
			console.log('map already has this layer: ',divID, layerID);
			visibleLayers = [];
			map.removeLayer(mapServer);
			console.log('current visible layers: ', visibleLayers);
			
		} else {
			console.log('map DOES NOT have this layer: ',divID, layerID);
			$(this).addClass('slick-btn-selection');
			visibleLayers = [layerID]
			mapServer.setLayers(visibleLayers);
			map.addLayer(mapServer);
			console.log('current visible layers: ', visibleLayers);
		}
	});

	/*  END EVENT HANDLERS */
});

function parseBaseLayers() {

	mapServer = L.esri.dynamicMapLayer(mapServerDetails);
	addMapLayer(mapServer, mapServerDetails);
	
}

function addMapLayer(mapServer, mapServerDetails) {
	
	$.getJSON(mapServerDetails.url + '/legend?f=json', function (legendResponse) {
			$.each(legendResponse.layers, function (index,legendValue) {
					
				$.each(layerList, function (index,layerValue) {
					
				if (legendValue.layerId == layerValue.layerID) {

					$('#baseLayerToggles').append('<button id="' + camelize(layerValue.layerName) + '" class="btn btn-default slick-btn mapLayerBtn equalize layerToggle" value="' + layerValue.layerID + '"><img alt="Legend Swatch" src="data:image/png;base64,' + legendValue.legend[0].imageData + '" />' + layerValue.layerName + '</button>')
				}
			})
		});
	});
}

function populateConstituentGroupFilters() {
	$.each(data.constituentGroupList , function( index, item ) {

		var dropDownName = camelize(item.constituentGroup) + "-select"
		$("#constituentFilterSelect").append("<select id='" + dropDownName  + "' class='selectpicker geoFilterSelect' multiple data-selected-text-format='count' data-dropup-auto='false' title='" + item.constituentGroup + "'></select>");

		//console.log(item.constituentGroup)

		$.each(item.pCodes, function( index, pcode ) {
			var val = Object.keys(pcode)[0];
			var text = pcode[Object.keys(pcode)[0]];
			//console.log(item.constituentGroup ,val,text)

			addFilterOption(val, val + ' | ' + text, '#' + dropDownName);
		});
	});

	//REFRESH	
	refreshAndSortFilters();
	
}

function refreshAndSortFilters() {

	//loop over each select dropdown
	$('.selectpicker').each(function( index ) {
		var id = $(this).attr('id');

		var items = $('#' + id + ' option').get();
		items.sort(function(a,b){
			var keyA = $(a).text();
			var keyB = $(b).text();

			if (keyA < keyB) return -1;
			if (keyA > keyB) return 1;
			return 0;
		});
		var select = $('#' + id);
		$.each(items, function(i, option){
			select.append(option);
		});
	});

	//refresh them all
	$('.selectpicker').selectpicker('refresh');
}

function setFilter(filterInfo, feature) {
	
	//constituent group filters, regex search for Pxxxxx
	for (i = 0; i < filterInfo.length; i++) { 
		var regex = /^(p|P)([0-9]{5})$/;
		if (regex.test(filterInfo[i].optionValue)) { 
			if (feature.properties[filterInfo[i].optionValue].length > 0) {
				console.log('match found');
				return true;
			}
		}

		//geoFilterSelect filters
		else {

			//loop over multiple filters if we have them
			for (i = 0; i < filterInfo.length; i++) { 
				if (feature.properties[filterInfo[i].selectName] === filterInfo[i].optionValue) {
					//console.log('match found',feature.properties);
					return true;
				}
			}
		}
	}
}

function loadSites(inputGeoJSON,filterInfo) {

	sitesLayer.clearLayers();
	
	curGeoJSONlayer = L.geoJson(inputGeoJSON, {
		//optional filter input
		filter: function(feature, layer) {
			//only drop into this loop if there is a filter selection
			if (filterInfo) {
				return setFilter(filterInfo,feature);
			}

			//make sure if there is no filter we pass the site thru
			return true;
		},
		pointToLayer: function (feature, latlng) {
			return L.circleMarker(latlng, geojsonMarkerOptions);
		},
		onEachFeature: function (feature, layer) {
			populateGeoFilters(feature);
			//too costly to create popups for all features here
		}
	})

		//set up popup here, so only instantiated on click
		.on('click', function(e) { 
			
			//create popup content
			var $popupContent = $('<div>', { id: 'popup' });
			
			$.each(e.layer.feature.properties, function( index, property ) {
				
				if (index.length > 0 && property.length > 0) {
					//limit the popup items
					if (popupItems.indexOf(index) != -1) {
						//use lookup to get long name for attribute
						$.each(data.attributeLookup[0], function( longName, shortName ) {
							if (shortName == index) {
								$popupContent.append('<b>' + longName + ':</b>  ' + property + '</br>')
							}	
						});
					}
				}
			});

			//open popup at clicked point
			var popup = L.popup({autoPan: false})
				.setLatLng(e.latlng)
				.setContent($popupContent.html())
				.openOn(map);
		});
	
	var siteCount = curGeoJSONlayer.getLayers().length;
	$('#siteCount').text(siteCount + ' sites')

	

	if (siteCount > 0) {

		//add to map
		sitesLayer.addLayer(curGeoJSONlayer);

		//zoom to select
		map.fitBounds(sitesLayer.getBounds());
	}
	else {
		toastr.error('Error', 'No sites found, please check your filter selections', {timeOut: 20000})

		//resetView();
	}

}

function loadCSV(url) {
	toastr.info('Drawing GeoJSON...', {timeOut: 0});
	$.ajax({
		type : "GET",
		url : url,
		dataType : "text",
		async : false,
		success : function(data){
			csv2geojson.csv2geojson(data, function(err, data) {
				masterGeoJSON = data
				loadSites(masterGeoJSON, null);
			});
		}
	});
}

function populateGeoFilters(feature) {

	//add to select dropdown
	$.each(GeoFilterGroupList, function(index, filter) {

		//populate the dropdowns
		var elementName = '#' + filter.dropDownID + '-select';

		//add filterOption
		addFilterOption(feature.properties[filter.dropDownID], feature.properties[filter.dropDownID], elementName);

	});
}

function addFilterOption(code, text, elementName) {
	//add it if it doesn't exist
	if (code && code !== 'na' && $(elementName + ' option[value="' + code + '"]').length == 0) {
		//console.log('adding an option for:',elementName,code)
		$(elementName).append($('<option></option>').attr('value',code).text(text));
	}
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
		toastr.error('Error', 'No sites to export', {timeOut: 0})
	}
}

function downloadKML() {
	//https://github.com/mapbox/tokml
	//https://gis.stackexchange.com/questions/159344/export-to-kml-option-using-leaflet
	var geojson = sitesLayer.toGeoJSON();

	if (geojson.features[0]) {
		var GeoJSON = geojson.features[0];
		var kml = tokml(GeoJSON);
		var filename = 'data.kml';
		downloadFile(kml,filename);
	}
	else {
		toastr.error('Error', 'No sites to export', {timeOut: 0})
	}
}

function downloadCSV() {
	var geojson = sitesLayer.toGeoJSON().features[0];

    if (geojson) {
		//get headers
        var attributeNames = Object.keys(geojson.features[0].properties);

        // write csv file
        var csvData = [];
        csvData.push(attributeNames.join(','));

        geojson.features.forEach(function(feature) {
            var attributes = [];
            attributeNames.forEach(function(name) {
                attributes.push((feature.properties[name].toString()));
            });
            csvData.push(attributes);
        });

        csvData = csvData.join('\n');

        var filename = 'data.csv';
		downloadFile(csvData,filename);
	}

	else {
		toastr.error('Error', 'No sites to export', {timeOut: 0})
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
	filterSelections = [];
}

function resetView() {

	$('#showConstituentFilterSelect').show();
	$('#geoFilterSelect').show();
	$('#constituentFilterSelect').hide();

	//clear any selection graphics
	loadSites(masterGeoJSON,null);

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