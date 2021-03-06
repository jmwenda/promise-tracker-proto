var PT = PT || {};

PT.colors = [
  "#f5be59", 
  "#66c6ba", 
  "#ea7669", 
  "#545757", 
  "#42847b", 
  "#efa9a3",
  "#e6e7e8",
  "#000000"
];

PT.extractAllImages = function(responses){
  var images = [];

  responses.forEach(function(response){
    response.answers.forEach(function(answer){
      if(answer.input_type == "image" && answer.value){
        images.push({
          value: answer.value,
          parentResponse: response
        });
      }
    })
  });

  return images;
};

PT.renderGoogleMap = function(serverResponse, containerId){
  var markers = [];
  var surveyDefinition = {};
  var map = null,
      infoWindow = null;
  var $container;

  var attachMarkerClickEvent = function(marker, response){
    var markerInfo = {
      id: response.id,
      image: null,
      displayableAnswers: {}
    };

    // 1. Browse through answers, extract image and responses
    for(var i=0,len=response.answers.length;i<len;i++){
      var answer = response.answers[i];
      switch(answer.input_type){
        case "location":
          break;
        case "image":
          if(typeof answer.value!=="undefined" && answer.value){
            markerInfo.image = answer.value;
          }
          break;
        default:
          markerInfo.displayableAnswers[surveyDefinition[answer.id]] = answer.value || "";
      }
    }

    // 2. Build marker popup template and attach listener
    google.maps.event.addListener(marker, "click", function(){
      infoWindow.setContent(HandlebarsTemplates["map_info_window"](markerInfo));
      infoWindow.open(map, marker);
    });
  };

  window.mapInit = function(){
    // Start initialization, create map
    var mapOptions = {
      zoom: 8,
      center: new google.maps.LatLng(-34.397, 150.644),
      scrollwheel: false
    };
    map = new google.maps.Map(document.getElementById(containerId), mapOptions);
    infoWindow = new google.maps.InfoWindow({
        content: ""
    });

    // Store survey definition
    var surveyInputs = serverResponse.survey.inputs;
    for(var i=0,len=surveyInputs.length;i<len;i++){
      var input = surveyInputs[i];
      surveyDefinition[input.id] = input.label;
    }

    // Create map markers
    var surveyResponses = serverResponse.responses;
    for(var i=0,len=surveyResponses.length;i<len;i++){
      var response = surveyResponses[i];

      // Find geo location
      var lat = null,
          lon = null;
      for(var j=0,len2=response.answers.length;j<len2;j++){
        var answer = response.answers[j];
        if(typeof answer.input_type!=="undefined" && answer.input_type=="location" && typeof answer.value!=="undefined" && typeof answer.value.lon!=="undefined"){
          lat = answer.value.lat;
          lon = answer.value.lon;
          break;
        }
      }
      if(lat==null || lon==null){
        if(response.locationstamp && response.locationstamp.lat !== "undefined" && response.locationstamp.long !== "undefined"){
          lat = response.locationstamp.lat;
          lon = response.locationstamp.lon;
        } else {
          continue; // Find if next response is a geolocation
        }
      }

      // Create marker
      if(lat && lon){
        var marker = new google.maps.Marker({
          map: map,
          position: new google.maps.LatLng(lat, lon)
        });
        markers.push(marker);

        attachMarkerClickEvent(marker, response);
      }
    }

    // Scale map viewport to include all markers
    var points = $.map(markers, function(a){
        return a.getPosition();
    });
    var bounds = new google.maps.LatLngBounds();
    for(var i=0;i<points.length;i++){
        bounds.extend(points[i]);
    }
    
    map.fitBounds(bounds);

    $("#map-tab").on("shown.bs.tab", function(){
      google.maps.event.trigger(map, "resize");
      map.fitBounds(bounds);
    });

  };

  // Load map script

  if(typeof google === "undefined"){
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://maps.googleapis.com/maps/api/js?v=3.exp&" +
        "callback=mapInit";
    document.body.appendChild(script);
  } else {
    window.mapInit();
  }
};

PT.aggregateData = function(payload){
  var survey = payload.survey;
  var responses = payload.responses;
  var answerAggregates = [];

  survey.inputs.forEach(function(input){
    var allAnswers = [];
    var tally;
    var inputSummary = {
      id: input.id,
      label: input.label,
      type: input.input_type,
      answers: []
    };

    responses.forEach(function(response){
      var relevantAnswer = response.answers.filter(function(answer){
        if(answer.id == input.id){
          var item = answer;
          item.parentResponse = response;
          return item;
        }
      })[0];

      relevantAnswer ? allAnswers.push(relevantAnswer) : false;
    });

    switch(input.input_type){
      case "location":
        inputSummary.answers = allAnswers;
        break;

      case "select1":
        input.options.forEach(function(option){
          tally = allAnswers.reduce(function(prev, current){
            return current.value == option ? prev + 1 : prev;
          }, 0);

          inputSummary.answers.push({label: option, tally: tally});
        })
        break;

      case "select":
        input.options.forEach(function(option){
          tally = allAnswers.reduce(function(acc, current){
            return current.value && current.value.indexOf(option) !== -1 ? acc + 1 : acc;
          }, 0);

          inputSummary.answers.push({label: option, tally: tally});
        })
        break;

      case "number":
      case "image":
      case "text":
        inputSummary.answers = allAnswers.reduce(function(acc, current){
          if(current && current.value){
            acc.push({parentResponse: current.response, value: current.value});
          }
          return acc;
        },[]);
        break;
    }
    answerAggregates.push(inputSummary);
  })

  return answerAggregates;
};

PT.renderGallery = function(images, containerId, galleryName){
  var $container = $(containerId);
  $container.empty();

  if(images.length > 0){
    images.forEach(function(image, index){
      var $a = $("<a/>");
      var $image = $("<div/>", {class: "gallery-image"});

      $a.attr("href", image.value);
      $a.attr("data-lightbox", galleryName);
      $image.css("background", "url(" + image.value + ") no-repeat center center");
      $image.css("background-size", "cover");
      $a.append($image);
      $container.append($a);
    });
  } else {
    $container.append("<img class='gallery-image placeholder' alt='Placeholder image'>")
  }
};

PT.renderText = function(strings, containerId){
  var $container = $(containerId);
  var $textBlock;

  strings.forEach(function(item, index){
    $textBlock = $("<span/>", {class: "text-viz"}).html(item.value);
    $textBlock.css("color", PT.colors[(index % PT.colors.length)]);
    $textBlock.css("font-size", Math.floor(Math.random(5) * 10 + 12) + "px");
    $container.append($textBlock);

    $textBlock.on("click", function(event){
      PT.showResponsePopup(event, item.parentResponse, PT.surveyDefinition);
    });
  });
};

PT.renderMapForLocationQuestion = function($div, input){

  // Find input's index in responses
  if(PT.responses.length <= 0) return;  // Quit if no response
  var inputIndex = _.findIndex(PT.responses[0].answers, function(element, index, array){
    return element.id == input.id
  });

  var validAnswers = input.answers.filter(function(el){
    return el.value && el.value.lat && el.value.lon;
  });

  var markerData = [{
    color: PT.colors[1],
    points: validAnswers.map(function(el){
              return {
                lon: el.value.lon,
                lat: el.value.lat,
                data: el.parentResponse
              }
            })
  }];

  $div.empty();
  var $canvas = $('<canvas width="'+$div.innerWidth()+'" height="'+$div.innerHeight()+'"/>').appendTo($div);

  $canvas.osmStaticMap({
    url: "http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    circleRadius: 8,
    markers: markerData,
    interactive: true,
    click: function(event, p){
      console.log(p[0].data.data);
      PT.showResponsePopup(event, p[0].data.data);
    }
  });
};

PT.renderMapForSummaryGraph = function($div, input){
  $div.empty();

  // Find input's index in responses
  if(PT.responses.length <= 0) return;  // Quit if no response
  var inputIndex = _.findIndex(PT.responses[0].answers, function(element, index, array){
    return element.id == input.id
  });

  // Find location index
  var locationIndex = _.findIndex(PT.responses[0].answers, function(element, index, array){
    return element.input_type == 'location';
  });

  // Identify and fomat responses with location information
  var markerData = input.answers.map(function(element, index, array){
    return {
      color: PT.colors[index % PT.colors.length],
      points: PT.responses.filter(function(el, i, arr){
                if(el.answers[locationIndex] && el.answers[locationIndex].value && el.answers[locationIndex].value.lat || el.locationstamp.lon){
                  return el.answers[inputIndex].value == element.label;
                }
              }).map(function(el, i, arr){
                  return {
                    lon: el.answers[locationIndex].value ? el.answers[locationIndex].value.lon : el.locationstamp.lon,
                    lat: el.answers[locationIndex].value ? el.answers[locationIndex].value.lat : el.locationstamp.lat,
                    data: el
                  }
              })
    }
  }).filter(function(el){ // Remove input sets with no data points
    return el.points.length > 0;
  });

  if(markerData.length > 0){
    var $canvas = $('<canvas width="'+$div.innerWidth()+'" height="'+$div.innerHeight()+'"/>').appendTo($div);

    $canvas.osmStaticMap({
      url: "http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      circleRadius: 8,
      markers: markerData,
      interactive: true,
      click: function(event, p){
        console.log(p[0].data.data);
        PT.showResponsePopup(event, p[0].data.data);
      }
    });
  } else {
    // Render chart at full width if no geographic data present
    $div.parent().find(".graph-square").addClass("col-md-12");
    $div.remove();
    $(window).resize();
  }
};

PT.renderInputSummaries = function(aggregates, containerId, graphClass, callback){
  if(aggregates.length > 0 && PT.responses.length > 0){
    var $container = $(containerId);
    var $vizBox, $graphSquare, $map;

    $container.empty();

    aggregates.forEach(function(input){
      $container.append(HandlebarsTemplates["input_viz"](input));
      $vizBox = $("#viz-input-" + input.id);

      switch(input.type){
        case "select":
        case "select1":
          $graphSquare = $("<div/>", {id: "graph-" + input.id, class: "graph-square " + graphClass});
          $vizBox.append($graphSquare);

          if(input.type == "select1"){
            PT.renderPieChart("#graph-" + input.id, input, true, false);
          } else {
            PT.renderColumnChart("#graph-" + input.id, input, true, false);
          };

          // Append map of color coded answers  
          $map = $("<div/>", {class: "col-md-7 graph-square graph-map-" + input.id});
          $vizBox.append($map);
          PT.renderMapForSummaryGraph($map, input);

          break;

        case "location":
          $map = $("<div/>", {class: "col-md-12 graph-square map-" + input.id});
          $vizBox.append($map);
          PT.renderMapForLocationQuestion($map, input);
          break;

        case "text":
          PT.renderText(input.answers, "#viz-input-" + input.id);
          break;

        case "number":
        case "date":
          // Render histogram?
          break;

        case "image":
          PT.renderGallery(input.answers, "#viz-input-" + input.id, "gallery-" + input.id);
          break;
      }
    })
  } else {
    $("#graph-placeholder").show();
  }

};

PT.renderGraphs = function(aggregates, containerId, graphClass){
  if(aggregates.length > 0 && PT.responses.length > 0){
    var $container = $(containerId), $graphSquare;

    $("#graph-placeholder").hide();
    $container.empty();

    aggregates.forEach(function(input){
      if(input.type == "select" || input.type == "select1"){
        $graphSquare = $(document.createElement("div"));

        $graphSquare.addClass(graphClass + " graph-square item");
        $graphSquare.attr("id", "graph-" + input.id)
        $container.append($graphSquare);

        switch(input.type){
          case "select1":
            PT.renderPieChart("#graph-" + input.id, input, false, true)
            break;

          case "select":
            PT.renderColumnChart("#graph-" + input.id, input, false, true)
            break;
        }
      }
    })

    // Show first item in graph carousel
    $(containerId + " .item").first().addClass("active");
    $(window).resize();
    if($(".carousel .item").length < 2){
      $(".carousel-control").hide();
    }
  }
};

PT.renderPieChart = function(containerId, inputSummary, titleDisabled, download){
  var data = inputSummary.answers.map(function(answer){
    return [answer.label, answer.tally];
  });

  !titleDisabled ? titleDisabled = inputSummary.label : titleDisabled = "";

  $(containerId).highcharts({
    chart: {
      plotBackgroundColor: null,
      plotShadow: false
    },
    colors: PT.colors,
    title: {
      text: titleDisabled
    },
    tooltip: {
      formatter: function(){
        return "<b>" + Highcharts.numberFormat(this.point.percentage, 1) + "%</b><br><span style='color: grey; font-size: .9em;'>(" + this.point.y + " " + I18n.t("campaigns.collect.responses.counting", {count: this.point.y}) + ")</span>"
      }
    },
    credits: {
      enabled: false
    },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: "pointer",
        dataLabels: {
          enabled: true,
          format: "<b>{point.name}</b>: {point.percentage:.1f} %",
          style: {
              color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || "black"
          },
          distance: 1
        }
      }
    },
    series: [{
      type: "pie",
      name: "",
      data: data
    }],
    exporting: {
      enabled: download
    },
    navigation: {
      buttonOptions: {
        verticalAlign: "bottom",
        x: -60
      }
    }
  });
};

PT.renderColumnChart = function(containerId, inputSummary, titleDisabled, download){
  var series = inputSummary.answers.map(function(answer){
    return {
      name: answer.label, 
      data: [answer.tally]
    };
  });

  !titleDisabled ? titleDisabled = inputSummary.label : titleDisabled = "";

  $(containerId).highcharts({
    chart: {
      type: "column",
      plotBackgroundColor: null,
      plotShadow: false
    },
    colors: PT.colors,
    titleDisabled: {
      text: titleDisabled || inputSummary.label
    },
    tooltip: {
      headerFormat: "{point.series.name}",
      pointFormat: "<br><b>{point.y}</b>"
    },
    credits: {
      enabled: false
    },
    xAxis: {
      lineColor: "transparent",
      tickWidth: 0,
      labels: {
        enabled: false
      }
    },
    yAxis: {
      allowDecimals: false,
      title: {
        text: ""
      }
    },
    plotOptions: {
      column: {
        allowPointSelect: true,
        cursor: "pointer",
        pointPadding: .25,
        borderWidth: 0,
        dataLabels: {
          enabled: false,
        }
      }
    },
    series: series,
    exporting: {
      enabled: download
    },
    navigation: {
      buttonOptions: {
        verticalAlign: "bottom",
        x: -60
      }
    }
  });
};

// Map popup window for single response
PT.showResponsePopup = function(event, response){
  event.stopPropagation();

  $(".response-container-outer").css({
    position: "absolute",
    top: event.pageY + 15,
    left: event.pageX - 50,
    width: window.innerWidth / 3 + "px"
  });

  PT.viewResponse(response);
  $(".response-container-outer").show();
};

// Profile page data section
$(function(){
  $(".carousel").carousel({
    pause: true,
    interval: false
  });

  // Hide carousel controls on first and last slide
  $(".carousel").on("slid.bs.carousel", function() {
    var $active = $(".carousel .item.active");
    $(window).resize();

    if($active.is(":first-child")){
      $(".carousel-control.left").fadeOut();
      $(".carousel-control.right").fadeIn();
    } else if($active.is(":last-child")) {
      $(".carousel-control.right").fadeOut();
      $(".carousel-control.left").fadeIn();
    } else {
      $(".carousel-control").fadeIn();
    }
  });

  $(document).ajaxSend(function(event, request, settings) {
    $(".ajax-loading").show();
  });

  $(document).ajaxComplete(function(event, request, settings) {
    $(".ajax-loading").hide();
  });
});
