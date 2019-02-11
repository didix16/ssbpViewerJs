(function(){

	window.lib = window.lib || {};
	window.lib.fileManager = window.lib.fileManager || {};

	window.lib.fileManager = {

		files: {},
		readerStatus: {
			DONE: 2,
			EMPTY: 0,
			LOADING: 1
		},
		readerEvents:{
			onLoad: function(event){

				//this.content = this.reader;
				var $this = this;
				if($this instanceof FileReader){
					console.log(event);
				}

			},
			onLoadStart: function(event){

			},
			onProgress: function(event){

			},
			onLoadEnd: function(event){

			},
			onAbort: function(event){

			},
			onError: function(event){

			}
		},


		addFile: function(options) {
			
			var that = this;
			this.files[options.id] = {
				file: options.file,
				content: '',
				id: options.id,
				reader: new FileReader(),
				serverSide: options.serverSide ? options.serverSide : true,
				uploadUrl: options.uploadUrl ? options.uploadUrl : '',

				readFile: function(type){

					switch(type){

						case "text":
							this.reader.readAsText(this.file);
							break;
						case "dataUrl":
							this.reader.readAsDataURL(this.file);
							break;
						case "arrayBuffer":
							this.reader.readAsArrayBuffer(this.file);
							break;
						default:
							return this;
					}	
					
					return this;

				},
				getId : function(){

					return this.id;
				},
				getSize: function(){
					return this.file.size;
				},
				getContent: function(){

					return this.content;
				},
				getName: function(){
					return this.file.name;
				},
				getMimeType: function(){
					return this.file.type;
				},
				getLastModifiedTime: function(){
					return this.file.lastModified;
				},
				onLoad: function(event){

					if(this instanceof FileReader){
						var file = that.files[options.id];
						file.content = this.result;
						options.onLoadCallback(file);

					}

					

				},
				onLoadStart: function(event){

				},
				onProgress: function(event){

				},
				onLoadEnd: function(event){

				},
				onAbort: function(event){

				},
				onError: function(event){

				},
				setUploadUrl: function(url){

					this.uploadUrl = url;
					return this;
				},
				getUploadUrl: function(){

					return this.uploadUrl;
				},
				sendToServer: function(){

					var formData = new FormData();
					formData.append(this.getId(),this.file);
					console.log(this.file);
					var that = this;
					$.ajax({
						url: that.getUploadUrl(),
						type: 'POST',
						xhr: function(){
							var myXhr = $.ajaxSettings.xhr();
							if(myXhr.upload){ // if upload property exists
		                        myXhr.upload.addEventListener('progress', options.onSendProgressCallback, false); // progressbar
		                    }
		                    return myXhr;
						},
						success: function(data){

							options.onSuccessCallback(data);
						},
						error: function(xhr,errStatus,errThrow){

							options.onErrorCallback(xhr,errStatus,errThrow);
						},
						data: formData,
						contentType: false,
						dataType: "json",
						processData: false

					});

				}

			};
			var file = this.files[options.id];
			console.log(file);
			var reader = file.reader;
			//var events = that.readerEvents;
			file.readFile("arrayBuffer");

			reader.onload = file.onLoad;
			reader.onloadstart = file.onLoadStart;
			reader.onprogress = file.onProgress;
			reader.onloadend = file.onLoadEnd;
			reader.onabort = file.onAbort;
			reader.onerror = file.onError;

			file.readFile();

			return this;
		},

		getFile: function(fileId){

			return this.files[fileId];
		},


		registerEvents: function(options){

			var that = this;
			$('input[type=file]').each(function(i,e){


				$(this).change(function(){
					//alert($(e).val());
					that.addFile(
						{
							id:$(e).attr("id"),
							file: $(e)[0].files[0],
							serverSide: options.serverSide ? options.serverSide : false,
							uploadUrl: options.uploadUrl ? options.uploadUrl : '',
							onLoadCallback: options.onLoadFile,
							onSendProgressCallback: options.onSendProgress,
							onSuccessCallback: options.onSendSuccess,
							onErrorCallback: options.onSendError,

						}
					);
				});
			});

			return this;
			
		},

		destroyEvents: function(){

			var that = this;
			$('input[type=file]').each(function(i,e){

				$(this)
				.off('change');

			});

			return this;

		},


	};

})();