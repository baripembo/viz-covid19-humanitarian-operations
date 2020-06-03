var map, mapFeatures, globalLayer, globalLabelLayer, globalMarkerLayer, countryLayer, countryLabelLayer, countryMarkerLayer, tooltip, markerScale, countryMarkerScale;
function initMap() {
  map = new mapboxgl.Map({
    container: 'global-map',
    style: 'mapbox://styles/humdata/ckaoa6kf53laz1ioek5zq97qh/draft',
    center: [10, 6],
    minZoom: 2,
    attributionControl: false
  });

  map.addControl(new mapboxgl.NavigationControl())
     .addControl(new mapboxgl.AttributionControl(), 'bottom-right');

  map.on('load', function() {
    //remove loader and show vis
    $('.loader').hide();
    $('main, footer').css('opacity', 1);

    //get layers
    map.getStyle().layers.map(function (layer) {
      switch(layer.id) {
        case 'adm0-fills':
          globalLayer = layer.id;
          break;
        case 'adm0-label':
          globalLabelLayer = layer.id;
          break;
        case 'hrp25-centroid-int-uncs':
          globalMarkerLayer = layer.id;
          break;
        case 'adm1-fills':
          countryLayer = layer.id;
          map.setLayoutProperty(countryLayer, 'visibility', 'none');
          break;
        case 'hrp25-centroid-adm1-simplified-o':
          countryLabelLayer = layer.id;
          map.setLayoutProperty(countryLabelLayer, 'visibility', 'none');
          break;
        case 'adm1-marker-points':
          countryMarkerLayer = layer.id;
          map.setLayoutProperty(countryMarkerLayer, 'visibility', 'none');
          break;
        default:
          //do nothing
      }
    });

    mapFeatures = map.queryRenderedFeatures();

    //country select event
    d3.select('.country-select').on('change',function(e) {
      var selected = d3.select('.country-select').node().value;
      if (selected=='') {
        resetMap();
      }
      else {        
        currentCountry = selected;
        currentCountryName = d3.select('.country-select option:checked').text();

        var selectedFeatures = [];
        mapFeatures.forEach(function(feature) {
          if (feature.sourceLayer=='hrp25_polbnda_int_15m_uncs' && feature.properties.ISO_3==currentCountry) {
            selectedFeatures.push(feature)
          }
        });
        
        if (currentIndicator.id=='#food-prices') {
          openModal(currentCountryName);
        }
        else {
          selectCountry(selectedFeatures);
        }
      }
    });

    //init global and country layers
    initGlobalLayer();
    initCountryLayer();

    //create tooltip
    tooltip = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'map-tooltip'
    });
  });
}


/****************************/
/*** GLOBAL MAP FUNCTIONS ***/
/****************************/
function initGlobalLayer() {
  //create log scale for circle markers
  markerScale = d3.scaleSqrt()
    .domain([1, maxCases])
    .range([2, 15]);
  
  //color scale
  colorScale = getGlobalColorScale();
  setGlobalLegend(colorScale);

  //data join
  var expression = ['match', ['get', 'ISO_3']];
  var expressionMarkers = ['match', ['get', 'ISO_3']];
  nationalData.forEach(function(d) {
    var val = d[currentIndicator.id];
    var color = (val<0 || val=='') ? colorNoData : colorScale(val);
    expression.push(d['#country+code'], color);

    //covid markers
    var covidVal = d['#affected+infected'];
    var size = markerScale(covidVal);
    expressionMarkers.push(d['#country+code'], size);
  });

  //default value for no data
  expression.push(colorDefault);
  expressionMarkers.push(0);
  
  //set properties
  map.setPaintProperty(globalLayer, 'fill-color', expression);
  map.setPaintProperty(globalMarkerLayer, 'circle-radius', expressionMarkers);
  map.setPaintProperty(globalMarkerLayer, 'circle-translate', [0,-10]);

  //define mouse events
  handleGlobalEvents();
}

function handleGlobalEvents(layer) {
  map.on('mouseenter', globalLayer, function(e) {
    map.getCanvas().style.cursor = 'pointer';
    if (currentIndicator.id!='#food-prices') {
      tooltip.addTo(map);
    }
  });

  map.on('mousemove', function(e) {
    if (currentIndicator.id!='#food-prices') {
      var features = map.queryRenderedFeatures(e.point, { layers: [globalLayer, globalLabelLayer, globalMarkerLayer] });
      var target;
      features.forEach(function(feature) {
        if (feature.sourceLayer=='hrp25_polbnda_int_15m_uncs')
          target = feature;
      });
      if (target!=undefined) {
        tooltip.setLngLat(e.lngLat);
        createMapTooltip(target.properties.ISO_3, target.properties.Terr_Name)
      }
    }
  });
     
  map.on('mouseleave', globalLayer, function() {
    map.getCanvas().style.cursor = '';
    tooltip.remove();
  });

  map.on('click', function(e) {
    tooltip.remove();
    var features = map.queryRenderedFeatures(e.point, { layers: [globalLayer, globalLabelLayer, globalMarkerLayer] });
    var target;
    features.forEach(function(feature) {
      if (feature.sourceLayer=='hrp25_polbnda_int_15m_uncs')
        target = feature;
    });
  
    if (target!=null) {
      currentCountry = target.properties.ISO_3;
      currentCountryName = target.properties.Terr_Name;

      if (currentCountry!=undefined) {
        if (currentIndicator.id=='#food-prices') {
          openModal(target.properties.Terr_Name);
        }
        else {
          selectCountry(features);
        }
      }
    }
    
  });
}

function selectCountry(features) {
  //set first country indicator
  $('#foodSecurity').prop('checked', true);
  currentCountryIndicator = {
    id: $('input[name="countryIndicators"]:checked').val(), 
    name: $('input[name="countryIndicators"]:checked').parent().text()
  };

  updateCountryLayer();
  map.setLayoutProperty(globalLayer, 'visibility', 'none');
  map.setLayoutProperty(globalMarkerLayer, 'visibility', 'none');
  map.setLayoutProperty(countryLayer, 'visibility', 'visible');
  map.setLayoutProperty(countryLabelLayer, 'visibility', 'visible');
  map.setLayoutProperty(countryMarkerLayer, 'visibility', 'visible');

  var bbox = turf.bbox(turf.featureCollection(features));
  var offset = 50;
  map.fitBounds(bbox, {
    padding: {left: $('.map-legend.country').outerWidth()+offset+10, right: $('.country-panel').outerWidth()+offset},
    linear: true
  });

  map.once('moveend', initCountryView);
}

function updateGlobalLayer() {
  //color scales
  colorScale = getGlobalColorScale();

  //data join
  var expression = ['match', ['get', 'ISO_3']];
  nationalData.forEach(function(d) {
    var val = d[currentIndicator.id];
    var color = colorDefault;
    if (currentIndicator.id=='#food-prices') {
      color = foodPricesColor;
    }
    else {
      color = (val<0 || val=='' || val==undefined) ? colorNoData : colorScale(val);
    }
    expression.push(d['#country+code'], color);
  });

  //default value for no data
  expression.push(colorDefault);

  map.setPaintProperty(globalLayer, 'fill-color', expression);
  setGlobalLegend(colorScale);

  if (currentIndicator.id=='#food-prices') {
    map.setLayoutProperty(globalMarkerLayer, 'visibility', 'none');
  }
  else {
    map.setLayoutProperty(globalMarkerLayer, 'visibility', 'visible');
  }
}

function getGlobalColorScale() {
  var max = d3.max(nationalData, function(d) { return +d[currentIndicator.id]; });
  if (currentIndicator.id.indexOf('pct')>-1) max = 1;
  else if (currentIndicator.id=='#severity+economic+num') max = 10;
  else if (currentIndicator.id=='#affected+inneed') max = roundUp(max, 1000000);
  else max = max;

  var scale;
  if (currentIndicator.id=='#severity+type') {
    scale = d3.scaleOrdinal().domain(['Very Low', 'Low', 'Medium', 'High', 'Very High']).range(informColorRange);
  }
  else if (currentIndicator.id=='#value+funding+hrp+pct') {
    var reverseRange = colorRange.slice().reverse();
    scale = d3.scaleQuantize().domain([0, 1]).range(reverseRange);
  }
  else if (currentIndicator.id=='#vaccination-campaign') {
    scale = d3.scaleOrdinal().domain(['Postponed / May postpone', 'On Track']).range(vaccinationColorRange);
  }
  else {
    scale = d3.scaleQuantize().domain([0, max]).range(colorRange);
  }

  return scale;
}

function setGlobalLegend(scale) {
  var div = d3.select('.map-legend.global');
  var svg;
  if (d3.select('.map-legend.global .scale').empty()) {
    createSource($('.map-legend.global .indicator-source'), currentIndicator.id);
    svg = div.append('svg')
      .attr('class', 'legend-container');
    svg.append('g')
      .attr('class', 'scale');

    var nodata = div.append('svg')
      .attr('class', 'no-data');

    nodata.append('rect')
      .attr('width', 15)
      .attr('height', 15);

    nodata.append('text')
      .attr('class', 'label')
      .text('No Data');

    //cases
    $('.map-legend.global').append('<h4>Number of COVID-19 cases</h4>');
    createSource($('.map-legend.global'), '#affected+infected');
    var markersvg = div.append('svg')
      .attr('height', '55px');
    markersvg.append('g')
      .attr("transform", "translate(5, 10)")
      .attr('class', 'legendSize');

    var legendSize = d3.legendSize()
      .scale(markerScale)
      .shape('circle')
      .shapePadding(40)
      .labelFormat(numFormat)
      .labelOffset(15)
      .cells(2)
      .orient('horizontal');

    markersvg.select('.legendSize')
      .call(legendSize);
  }
  else {
    updateSource($('.indicator-source'), currentIndicator.id);
  }

  var legendTitle = $('.menu-indicators').find('.selected').attr('data-legend');
  $('.map-legend.global .indicator-title').text(legendTitle);

  var legendFormat = ((currentIndicator.id).indexOf('pct')>-1) ? percentFormat : shortenNumFormat;
  var legend = d3.legendColor()
    .labelFormat(legendFormat)
    .cells(colorRange.length)
    .scale(scale);

  var g = d3.select('.map-legend.global .scale');
  g.call(legend);

  if (currentIndicator.id=='#vaccination-campaign')
    $('.legend-container').addClass('vaccination-campaign');
  else
    $('.legend-container').removeClass('vaccination-campaign');
}


/*****************************/
/*** COUNTRY MAP FUNCTIONS ***/
/*****************************/
function initCountryLayer() {
  //color scale
  var countryColorScale = d3.scaleQuantize().domain([0, 1]).range(colorRange);
  createCountryLegend(countryColorScale);

  //mouse events
  map.on('mouseenter', countryLayer, function(e) {
    map.getCanvas().style.cursor = 'pointer';
    tooltip.addTo(map);
  });

  map.on('mousemove', countryLayer, function(e) {
    var f = map.queryRenderedFeatures(e.point)[0];
    if (f.properties.ADM0_PCODE!=undefined && f.properties.ADM0_REF==currentCountryName) {
      map.getCanvas().style.cursor = 'pointer';
      createCountryMapTooltip(f.properties.ADM1_REF);
      tooltip
        .addTo(map)
        .setLngLat(e.lngLat);
    }
    else {
      map.getCanvas().style.cursor = '';
      tooltip.remove();
    }
  });
     
  map.on('mouseleave', countryLayer, function() {
    map.getCanvas().style.cursor = '';
    tooltip.remove();
  });
}

function updateCountryLayer() {
  if (currentCountryIndicator.id=='#affected+food+ipc+p3+pct') checkIPCData();

  //$('.map-legend.country .legend-container').show();
  var max = getCountryIndicatorMax();
  if (currentCountryIndicator.id.indexOf('pct')>0 && max>0) max = 1;
  if (currentCountryIndicator.id=='#org+count+num') max = roundUp(max, 10);

  //color scale
  var clrRange = (currentCountryIndicator.id.indexOf('vaccinated')>0) ? immunizationColorRange : colorRange;
  var countryColorScale = d3.scaleQuantize().domain([0, max]).range(clrRange);

  //create log scale for circle markers
  // var healthFacilityMax = d3.max(subnationalData, function(d) {
  //   if (d['#country+code']==currentCountry)
  //     return +d['#loc+count+health']; 
  // })
  // var markerScale = d3.scaleSqrt()
  //   .domain([1, healthFacilityMax])
  //   .range([2, 15]);

  //data join
  var expression = ['match', ['get', 'ADM1_PCODE']];
  var expressionOutline = ['match', ['get', 'ADM1_PCODE']];
  var expressionText = ['match', ['get', 'ADM1_PCODE']];
  //var expressionMarkers = ['match', ['get', 'ADM1_PCODE']];
  subnationalData.forEach(function(d) {
    var color, colorOutline, textOpacity, markerSize;
    if (d['#country+code']==currentCountry) {
      var val = +d[currentCountryIndicator.id];
      color = (val<0 || val==' ' || isNaN(val)) ? colorNoData : countryColorScale(val);
      colorOutline = '#CCC';
      textOpacity = 1;

      //health facility markers
      // var healthVal = (currentCountryIndicator.id=='#loc+count+health') ? d['#loc+count+health'] : 0;
      // markerSize = markerScale(healthVal);
    }
    else {
      color = colorDefault;
      colorOutline = colorDefault;
      textOpacity = 0;
      markerSize = 0;
    }
    
    expression.push(d['#adm1+code'], color);
    expressionOutline.push(d['#adm1+code'], colorOutline);
    expressionText.push(d['#adm1+code'], textOpacity);
    //expressionMarkers.push(d['#adm1+code'], markerSize);
  });
  expression.push(colorDefault);
  expressionOutline.push(colorDefault);
  expressionText.push(0);
  //expressionMarkers.push(0);

  //set properties
  map.setPaintProperty(countryLayer, 'fill-color', expression);
  map.setPaintProperty(countryLayer, 'fill-outline-color', expressionOutline);
  map.setPaintProperty(countryLabelLayer, 'text-opacity', expressionText);

  //set health facility markers
  // map.setPaintProperty(countryMarkerLayer, 'circle-radius', expressionMarkers);
  // map.setPaintProperty(countryMarkerLayer, 'circle-color', '#007ce1');
  // map.setPaintProperty(countryMarkerLayer, 'circle-opacity', 0.6);
  // map.setPaintProperty(countryMarkerLayer, 'circle-translate', [0,-10]);

  //hide color scale if no data
  if (max!=undefined && max>0)
    updateCountryLegend(countryColorScale);
  // else
  //   $('.map-legend.country .legend-container').hide();
}

function checkIPCData() {
  var index = 0;
  subnationalData.forEach(function(d) {
    if (d['#country+code']==currentCountry) {
      var val = +d[currentCountryIndicator.id];
      if (index==0 && val==' ') {
        currentCountryIndicator.id = '#affected+ch+food+p3+pct';
      }
      index++;
    }
  });
}

function getCountryIndicatorMax() {
  var max =  d3.max(subnationalData, function(d) { 
    if (d['#country+code']==currentCountry) {
      return +d[currentCountryIndicator.id]; 
    }
  });
  return max;
}

function createCountryLegend(scale) {
  createSource($('.map-legend.country .food-security-source'), '#affected+food+ipc+p3+pct');
  createSource($('.map-legend.country .population-source'), '#population');
  createSource($('.map-legend.country .orgs-source'), '#org+count+num');
  createSource($('.map-legend.country .health-facilities-source'), '#loc+count+health');
  createSource($('.map-legend.country .immunization-source'), '#population+ipv1+pct+vaccinated');

  var legend = d3.legendColor()
    .labelFormat(percentFormat)
    .cells(colorRange.length)
    .title('LEGEND')
    .scale(scale);

  var div = d3.select('.map-legend.country');
  var svg = div.append('svg')
    .attr('class', 'legend-container');

  svg.append('g')
    .attr('class', 'scale')
    .call(legend);

  //no data
  var nodata = div.append('svg')
    .attr('class', 'no-data');

  nodata.append('rect')
    .attr('width', 15)
    .attr('height', 15);

  nodata.append('text')
    .attr('class', 'label')
    .text('No Data');
}

function updateCountryLegend(scale) {
  if (currentIndicator.id.indexOf('food') >-1) {
    ('.map-legend.country .food-security-source').empty();
    createSource($('.map-legend.country .food-security-source'), currentIndicator.id);
  }

  var legendFormat;
  switch(currentCountryIndicator.id) {
    case '#affected+food+p3+pct':
      legendFormat = percentFormat;
      break;
    case '#affected+ch+food+p3+pct':
      legendFormat = percentFormat;
      break;
    case '#population':
      legendFormat = shortenNumFormat;
      break;
    default:
      legendFormat = d3.format('.0s');
  }
  if (currentCountryIndicator.id.indexOf('vaccinated')>-1) legendFormat = percentFormat;
  var legend = d3.legendColor()
    .labelFormat(legendFormat)
    .cells(colorRange.length)
    .scale(scale);

  var g = d3.select('.map-legend.country .scale');
  g.call(legend);
}


/*************************/
/*** TOOLTIP FUNCTIONS ***/
/*************************/
function createMapTooltip(country_code, country_name){
  var country = nationalData.filter(c => c['#country+code'] == country_code);
  var val = country[0][currentIndicator.id];

  //format content for tooltip
  if (currentIndicator.id=='#vaccination-campaign') {
    var vaccData = [];
    vaccinationDataByCountry.forEach(function(country) {
      if (country.key==country_code) {
        vaccData = country.values;
      }
    });
    if (vaccData.length<1) {
      var content = '<h2>' + country_name + '</h2><div class="stat">No data</div>';
    }
    else {
      var content = '<h2>' + country_name + '</h2>';
      content += '<table><tr><th>Campaign Vaccine:</th><th>Planned Start Date:</th><th>Status:</th></tr>';
      vaccData.forEach(function(row) {
        var className = (row['#status+name'].indexOf('Postpone')>-1) ? 'covid-postpone' : '';
        content += '<tr class="'+className+'"><td>'+row['#service+name']+'</td><td>'+row['#date+start']+'</td><td>'+row['#status+name']+'</td></tr>';
      });
      content += '</table>';
    }
  }
  else {
    if (val!=undefined && val!='') {
      if (currentIndicator.id.indexOf('pct')>-1) val = percentFormat(val);
      if (currentIndicator.id=='#affected+inneed' || currentIndicator.id=='#severity+economic+num' || currentIndicator.id.indexOf('funding+total+usd')>-1) val = shortenNumFormat(val);
    }
    else {
      val = 'No Data';
    }
    var content = '<h2>' + country_name + '</h2>'+ currentIndicator.name + ':<div class="stat">' + val + '</div>';

    //covid cases and deaths
    content += '<div class="cases">COVID-19 Cases: ' + numFormat(country[0]['#affected+infected']) + '<br/>';
    content += 'COVID-19 Deaths: ' + numFormat(country[0]['#affected+killed']) + '</div>';
  }

  showMapTooltip(content);
}

function createCountryMapTooltip(adm1_name){
  var adm1 = subnationalData.filter(function(c) {
    if (c['#adm1+name']==adm1_name && c['#country+code']==currentCountry)
      return c;
  });
  var val = adm1[0][currentCountryIndicator.id];

  //format content for tooltip
  if (val!=undefined && val!='' && !isNaN(val)) {
    if (currentCountryIndicator.id.indexOf('pct')>-1) val = percentFormat(val);
    if (currentCountryIndicator.id=='#population') val = shortenNumFormat(val);
  }
  else {
    val = 'No Data';
  }
  var content = '<h2>' + adm1_name + '</h2>' + currentCountryIndicator.name + ':<div class="stat">' + val + '</div>';

  showMapTooltip(content);
}

function showMapTooltip(content) {
  tooltip.setHTML(content);
}


function initCountryView() {
  setSelect('countrySelect', currentCountry);
  $('.content').addClass('country-view');
  $('.country-panel').show().scrollTop(0);

  initCountryPanel();
}


function resetMap() {
  map.setLayoutProperty(countryLayer, 'visibility', 'none');
  map.setLayoutProperty(countryLabelLayer, 'visibility', 'none');
  $('.content').removeClass('country-view');
  $('.country-panel').fadeOut();
  setSelect('countrySelect', '');

  updateGlobalLayer();

  map.flyTo({ 
    speed: 2,
    zoom: 2,
    center: [10, 6] 
  });
  map.once('moveend', function() {
    map.setLayoutProperty(globalLayer, 'visibility', 'visible');
    map.setLayoutProperty(globalMarkerLayer, 'visibility', 'visible');
  });
}

