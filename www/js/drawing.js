/*global $, io*/
/*
 * Main Application Function
 * @param {Object} options
 */
 var username;
DrawingPad = function(options) { 
	"use strict";
	var defaults = {
		width : 500,
		height : 500,
		defaultColor : "#00000",
		defaultStroke : 4
	}, 
	tools = [
		"share",
		"draw",
		"line",
		"trash",
	],
	settings = $.extend(defaults, options), 
	drawingPad={};
	drawingPad.points=[];
	
	drawingPad.isTouchDevice = 'ontouchstart' in document.documentElement;
	
	/////////////\ SOCKET.IO CALLBACKS \/////////////
	
	/**
	 * Remote user has cleared their canvas so clear the one your looking at too
	 * @param {Object} data
	 */
	function eraseShared(data){
		if(drawingPad.thisObj[data.id]){
			drawingPad.thisObj[data.id].ctx.clearRect(0, 0, drawingPad.myCanvas.width, drawingPad.myCanvas.height);
		}
	}
	
	/**
	 * After getting the latest id's from the server it 
	 * builds a list with those names
	 * @param {Object} data
	 */
	function setUserList(data){
		
		//Build HTML
		$("body").append(_buildUsersList(data));
		$('.userListWrapper').on('shown', function () {
			$(".userList li").click(function(){
				//announce new user added
				drawingPad.thisObj.socket.emit('requestShare', {senderId : drawingPad.thisObj.id, listenerId : $(this).attr("data-id"), senderName : drawingPad.myName}); //callback createNewClient
			});
		});
		$('.userListWrapper').modal("show");
	}
	
	/**
	 * A shared user has refreshed there screen or 
	 * navigated away so their shared canvas is no longer needed
	 * @param {Object} data
	 */
	function deleteShared(data){
		drawingPad.thisObj.find("#" + data.id).remove();
	}
	/**
	 * Alerts you that another user would like to share. Builds a new canvas on that users instance if you accept.
	 * @param {Object} data
	 */
	function createNewClient(data){
		
		if(drawingPad.thisObj.id === data.listenerId && !drawingPad.thisObj[data.senderId]){ //test to see if this instance is the one i want.
			if(confirm(data.senderName + " wants to share their canvas.")){
				drawingPad.thisObj.socket.emit('confirmShare', {isSharing : true, senderId : data.senderId, listenerId : drawingPad.thisObj.id, senderName : drawingPad.myName});
				drawingPad.isSharing = true; //you are now sharing
				_createSharedCanvas(data.senderId);
			} else { //not sharing
				drawingPad.thisObj.socket.emit('confirmShare', {isSharing : false, senderId : data.senderId, listenerId : drawingPad.thisObj.id, senderName : drawingPad.myName});
			}
		}
	}
	
	/**
	* Alerts you that a user has decided to share with you
	* @param {Object} data
	*/
	function setConfirmShare(data){
		var message="";
		
		if(drawingPad.thisObj.id === data.senderId){
			if(data.isSharing){
				message = data.senderName + " has agreed to share.";
				//create new canvas
				drawingPad.isSharing = true;
				_createSharedCanvas(data.listenerId);
			} else {
				message = data.senderName + " has NOT agreed to share.";
			}
			alert(message);
		}
	}
	/**
	 * draws on your's and the shared canvas 
	 * @param {Object} data
	 */
	function draw(data, fromMe){

		if(drawingPad.thisObj[data.id]){
			var eventType = _eventTypes(data.isTouchDevice),
			ctx = drawingPad.thisObj[data.id].ctx,
			scratchCtx = drawingPad.thisObj.scratch.ctx;
			
			//set the ctx
			ctx.strokeStyle = data.color;
			ctx.lineWidth = data.stroke;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			
			scratchCtx.strokeStyle = data.color;
			scratchCtx.lineWidth = data.stroke;
			scratchCtx.lineCap = "round";
			scratchCtx.lineJoin = "round";
			
			if(data.isErase){
				ctx.globalCompositeOperation = "destination-out";
				scratchCtx.globalCompositeOperation = "destination-out";
			} else {
				ctx.globalCompositeOperation = "source-over";
				scratchCtx.globalCompositeOperation = "source-over";
			}


			if (data.type === eventType.down) {		
				drawingPad.okToDraw = true;
				if(fromMe && !data.isLineDrawing){
					drawingPad.points.push({x : data.x, y : data.y});
				} else if(data.isLineDrawing) {	//for line drawing we only need the coords
					drawingPad.thisObj[data.id].x = data.x;
					drawingPad.thisObj[data.id].y = data.y;
				} else { //from a shared canvas
					ctx.beginPath();
					ctx.moveTo(data.x, data.y);
				}
			} else if ((data.type === eventType.move) && drawingPad.okToDraw) {
				
				
			    if(data.isLineDrawing && fromMe) {	//draw the line on a temp canvas
					scratchCtx.clearRect(0, 0, drawingPad.myCanvas.width, drawingPad.myCanvas.height);
					scratchCtx.beginPath();
					scratchCtx.moveTo(drawingPad.thisObj[data.id].x, drawingPad.thisObj[data.id].y);
					scratchCtx.lineTo(data.x, data.y);
					scratchCtx.stroke();
				} else if(fromMe){
					scratchCtx.clearRect(0, 0, drawingPad.myCanvas.width, drawingPad.myCanvas.height); 
					drawingPad.points.push({x : data.x, y : data.y});
					_drawPoints(scratchCtx);
				} else if(!data.isLineDrawing) { //this is coming from drawing a shared canvas
					ctx.lineTo(data.x, data.y);
					ctx.stroke();
				}
			} else if(data.type === eventType.up){
				if(data.isLineDrawing) {	//when done put the scratch line on the scratch canvas
					ctx.beginPath();
					ctx.moveTo(drawingPad.thisObj[data.id].x, drawingPad.thisObj[data.id].y);
					ctx.lineTo(data.x, data.y);
					ctx.stroke();
					ctx.closePath();
					scratchCtx.clearRect(0, 0, drawingPad.myCanvas.width, drawingPad.myCanvas.height);
				} else if(fromMe){  
					ctx.drawImage(drawingPad.scratchCanvas, 0, 0);
					scratchCtx.clearRect(0, 0, drawingPad.myCanvas.width, drawingPad.myCanvas.height);
				} else {
					ctx.closePath();
				}
				drawingPad.okToDraw = false;
				scratchCtx.closePath();
				
				drawingPad.points = [];
			}
		}
	
	}
	
	//////////////////\ PRIVATE METHODS \////////////////
	/**
	 * Simple Random Id Generator
	 * @param {int} strLength
	 */
	function _randomString(strLength) {
		var chars = "ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz", randomstring = '', rnum, i;
		if (strLength === undefined) {
			strLength = 5;
		}
		for ( i = 0; i < strLength; i++) {
			rnum = Math.floor(Math.random() * chars.length);
			randomstring += chars.substring(rnum, rnum + 1);
		}
		return randomstring;
	}
	
	/**
	 * Creates a shared Canvas instance
	 * @param {int} id
	 */
	function _createSharedCanvas(id) {

		if (!drawingPad.thisObj[id]) {
			var sharedCanvas = document.createElement('canvas'),
			canvas = drawingPad.thisObj.find("#" + drawingPad.thisObj.id);
			
			sharedCanvas.id = id;
			sharedCanvas.width = canvas.width();
			sharedCanvas.height = canvas.height();

			$(sharedCanvas).addClass("sharedCanvas");

			drawingPad.thisObj[id] = {};
			drawingPad.thisObj[id].ctx = sharedCanvas.getContext('2d');

			$(drawingPad.thisObj).append(sharedCanvas);
		}
	}
	
	/**
	 * Builds the tool bar HTML
	 */
	function _buildToolBar(){
		var i, 
		len = tools.length,
		tool="";
		for(i=0; i < len;i+=1) {
			tool +=  "<li data-toggle='tooltip' data-placement='right' data-original-title='" + tools[i] + "' class='sprite " + tools[i] + "'></li>"; 
		}
		
		return "<ul class='toolbar'>" + tool + "</ul>";
	}
	/**
	 * Builds a model box for user to create a user name.
	 */
	function _buildUserCreate(){
		return '<div class="modal fade userNameModal">' +
		'<div class="modal-header">' +
		'<h3>Create a user name.</h3>' +
		'</div>' +
		'<div class="modal-body">' +
		'<input type="text" size="30" name="name" class="userNameInput">' +
		'</div>' +
		'<div class="modal-footer">' +
		'<a href="#" class="btn confirm" data-dismiss="modal">Confirm</a>' +
		'</div>' +
		'</div>';
	}
	
	/**
	 * Builds a User list
	 * @param {Object} userList
	 */
	function _buildUsersList(userList){
		var uList="", key="", clientCount=0, modal;
		
		
		for(key in userList) {
			var sharing = "";
			if(userList[key].id !== drawingPad.thisObj.id){
				
				drawingPad.thisObj[key]? sharing = " - ( X )" : sharing = "";
				uList += "<li data-dismiss='modal' data-id='" + userList[key].id + "'>" + userList[key].senderName + sharing + "</li>";
				clientCount++;
			}
		}
		//clear any old lists
		$(".userListWrapper").remove();
		
		//create modal
		modal = '<div class="modal fade userListWrapper">' +
		'<div class="modal-header">' +
		'<h3>Users to share with</h3>' +
		'</div>' +
		'<div class="modal-body">' +
		'<ul class="userList">' + uList + '</ul>' +
		'</div>' +
		'<div class="modal-footer">' +
		'<a href="#" class="btn" data-dismiss="modal">Close</a>' +
		'</div>' +
		'</div>';

		if(clientCount === 0) {
			alert("There are no other users at this time.");
		}
		
		return clientCount > 0 ? modal : ""; //only show this if there are users to share with
		
	}
	/**
	 * Maps Coords to mouse location.
	 */
	function _getCoords(e) {
		var _x = 0, _y = 0;
		if(e.touches){ //android
			if(e.touches.length > 0){
				_x = e.touches[0].pageX - $(drawingPad.myCanvas).offset().left;
				_y = e.touches[0].pageY - $(drawingPad.myCanvas).offset().top;
			} else {
				_x = e.pageX - $(drawingPad.myCanvas).offset().left;
				_y = e.pageY - $(drawingPad.myCanvas).offset().top;
			}
		} else if (e.layerX || e.layerX === 0) {// Firefox
			_x = e.layerX;
			_y = e.layerY;
		} else {
			_x = e.pageX - $(drawingPad.myCanvas).offset().left;
			_y = e.pageY - $(drawingPad.myCanvas).offset().top;
		}

		return {
			"x" : _x,
			"y" : _y
		};
	}
	
	/**
	 * Determine event types and assigns the correct event types
	 */
	function _eventTypes(isTouchDevice){
		return {
			down : isTouchDevice? "touchstart" : "mousedown",
			move : isTouchDevice? "touchmove" : "mousemove",
			up : isTouchDevice? "touchend" : "mouseup",
			out : "mouseout"
		};
	}
	
	/**
	 * Adds the event handlers to everything
	 */
	function _setEventHandlers(){
		var eventType = _eventTypes(drawingPad.isTouchDevice),
		events = eventType.down + " " + eventType.move + " " + eventType.up + " " + eventType.out;
		
		window.onunload = function(e) {
			drawingPad.thisObj.socket.emit('deleteSharedById', {id : drawingPad.thisObj.id});
		};
		
		$(".toolbar li").tooltip(options);
		
		//events for tool bar
		$(".toolbar").find(".sprite").click(function(){
			drawingPad.isDrawing = false;
			drawingPad.isLineDrawing = false;
			drawingPad.isType = false;
			//clear selected
			$(".sprite").removeClass("selected");
			if($(this).hasClass(tools[0])){			//share
				//Get Users List
				drawingPad.thisObj.socket.emit("getUserList");
			} else if($(this).hasClass(tools[1])){		//draw
				$(this).addClass("selected");
				drawingPad.isDrawing = true;
			} else if($(this).hasClass(tools[2])){		//line
				$(this).addClass("selected");
				drawingPad.isLineDrawing = true;
			} else if($(this).hasClass(tools[3])){		//trash
				$("body").prepend('<div class="alert alert-block alert-error fade in">' +
				'<h4>Oh Snap you sure?!</h4>' +
				'<p>Are you sure you want to clear your drawpad.</p><br/>' +
				'<a class="btn btn-danger" href="#" data-dismiss="alert">Clear Drawing</a> <a class="btn btn-default" href="#" data-dismiss="alert">NO don\'t!</a>' +
				'</div>');
				$(".btn-danger").click(function(){
					drawingPad.thisObj[drawingPad.thisObj.id].ctx.clearRect(0, 0, drawingPad.myCanvas.width, drawingPad.myCanvas.height);
					drawingPad.thisObj.socket.emit("eraseRequestById",{id : drawingPad.thisObj.id});
				});
				$(".alert").show().alert();
			}
		}).hover(function(){
			$(this).addClass("hover");
		},function(){
			$(this).removeClass("hover");
		});
		
		drawingPad.thisObj.find(".myCanvas").bind(events, function(e){
			e.preventDefault();
			if(drawingPad.isDrawing || drawingPad.isLineDrawing) {
				var coords = _getCoords(drawingPad.isTouchDevice?e.originalEvent:e),
				data = {
					x: coords.x,
					y: coords.y,
					type: e.type,
					isTouchDevice : drawingPad.isTouchDevice,
					color: drawingPad.thisObj[drawingPad.thisObj.id].ctx.strokeStyle,
					stroke : drawingPad.thisObj[drawingPad.thisObj.id].ctx.lineWidth,
					isLineDrawing : drawingPad.isLineDrawing,
					isErase : drawingPad.isErase,
					id : drawingPad.thisObj.id
				};
				
				draw(data, true);
				
				if(drawingPad.okToDraw || e.type === eventType.up) {
					drawingPad.isSharing ? drawingPad.thisObj.socket.emit('drawRequest', data) : "";
				}
			}
		});
		
	}
	/**
	 * Smoothes out the line your drawing.
	 * @param {Object} ctx 
	 */
	function _drawPoints(ctx) {
		var i, len, c, d;
		if (drawingPad.points.length < 3) {
			return;
		}

		ctx.beginPath();
		ctx.moveTo(drawingPad.points[0].x, drawingPad.points[0].y);

		len = (drawingPad.points.length -2);

		for ( i = 1; i < len; i++) {
			c = ((drawingPad.points[i].x + drawingPad.points[i + 1].x) / 2);
			d = ((drawingPad.points[i].y + drawingPad.points[i + 1].y) / 2);
			ctx.quadraticCurveTo(drawingPad.points[i].x, drawingPad.points[i].y, c, d);
		}

		ctx.quadraticCurveTo(drawingPad.points[i].x, drawingPad.points[i].y, drawingPad.points[i + 1].x, drawingPad.points[i + 1].y);
		ctx.stroke();
	}
	//////////////////\ START PUBLIC METHODS \////////////////
	
	/**
	 * Init DrawingPad
	 */
	this.init = function(selector) {
		
		var id = _randomString(10);
		drawingPad.myCanvas = document.createElement('canvas');
		drawingPad.scratchCanvas = document.createElement('canvas'); 
		drawingPad.thisObj = $(selector);
		drawingPad.thisObj.id = id;

		drawingPad.myCanvas.id = id;
		drawingPad.myCanvas.width = settings.width;
		drawingPad.myCanvas.height = settings.height;
		drawingPad.thisObj[id] = {}; //create new obj
		drawingPad.thisObj[id].ctx = drawingPad.myCanvas.getContext('2d');
		drawingPad.thisObj[id].ctx.strokeStyle = settings.defaultColor;
		drawingPad.thisObj[id].ctx.lineWidth = settings.defaultStroke;
		
		//
		drawingPad.scratchCanvas.id = "scratchId";
		drawingPad.scratchCanvas.width = drawingPad.myCanvas.width;
		drawingPad.scratchCanvas.height = drawingPad.myCanvas.height;
		drawingPad.thisObj.scratch = {};
		drawingPad.thisObj.scratch.ctx = drawingPad.scratchCanvas.getContext('2d');
		drawingPad.thisObj.scratch.ctx.strokeStyle = settings.defaultColor;
		drawingPad.thisObj.scratch.ctx.lineWidth = settings.defaultStroke;
		
		$(drawingPad.myCanvas).addClass("myCanvas");
		$(drawingPad.scratchCanvas).addClass("myCanvas");

		$(selector).append(drawingPad.scratchCanvas); //add canvas to DOM
		$(selector).append(drawingPad.myCanvas); //add canvas to DOM
		$(selector).append(_buildToolBar); //add tool bar to DOM
		
		//register socket listeners
		drawingPad.thisObj.socket = io.connect("http://localhost:4000");
	
	    drawingPad.thisObj.socket.on('setUserList', function(data) {
			return setUserList(data); //show pop up list
		});
		
		drawingPad.thisObj.socket.on('draw', function(data) {
			return draw(data);
	    });
	    
	    drawingPad.thisObj.socket.on('eraseShared', function(data) {
			return eraseShared(data);
		});
		
		drawingPad.thisObj.socket.on('createNewClient', function(data) {
			return createNewClient(data);
	    });
	    
	    drawingPad.thisObj.socket.on('deleteShared', function(data) {
			return deleteShared(data); //remove shared canvas
		});
		
		drawingPad.thisObj.socket.on('setConfirmShare', function(data) {
			return setConfirmShare(data);
	    });
		
		//set event handlers
		_setEventHandlers();
		
		$("body").append(_buildUserCreate());
		$('.userNameModal').on('shown', function () {
			$(".confirm").click(function(){
				drawingPad.myName = $(".userNameInput").val().trim();
				username = drawingPad.myName;
				//tell the server i'm here
				drawingPad.thisObj.socket.emit('setClientId', {id : id, senderName : drawingPad.myName});
			});
		});
		$('.userNameModal').modal("show");
	};
};
var ws = new WebSocket('ws://' + window.document.location.host);
//Chat Functions
	//Recieved
    ws.onmessage = function(message) {
    	var msgDiv = document.createElement('div');
    	msgDiv.innerHTML = message.data;
    	document.getElementById('messages').appendChild(msgDiv);
    };
    //Sent
    function sendMessage() {
        var message = username + ": " + document.getElementById('msgBox').value;
        ws.send(message);
        document.getElementById('msgBox').value = '';
    };
    //Enter Key
	function handleKeyPress(event){
		if(event.keyCode == 13){
			sendMessage();
			return false; //don't propogate event
		}
	};
	//Clear
	function clearChat()
	{
   		$("#messages").html("");
	}
