(function(){

	window.lib = window.lib || {};
	window.lib.ssbpManager = window.lib.ssbpManager || {};

	window.lib.ssbpManager = {

		flags: {
			PART_FLAG_INVISIBLE: 1 << 0,		/// 非表示
			PART_FLAG_FLIP_H: 1 << 1,		/// 横反転
			PART_FLAG_FLIP_V: 1 << 2,		/// 縦反転

			// optional parameter flags:
			PART_FLAG_CELL_INDEX: 1 << 3,		/// セル番号
			PART_FLAG_POSITION_X: 1 << 4,		/// X座標
			PART_FLAG_POSITION_Y: 1 << 5,		/// Y座標
			PART_FLAG_POSITION_Z: 1 << 6,		/// Z座標
			PART_FLAG_PIVOT_X: 1 << 7,		/// 原点オフセットX
			PART_FLAG_PIVOT_Y: 1 << 8,		/// 原点オフセットY
			PART_FLAG_ROTATIONX: 1 << 9,		/// X回転
			PART_FLAG_ROTATIONY: 1 << 10,		/// Y回転
			PART_FLAG_ROTATIONZ: 1 << 11,		/// Z回転
			PART_FLAG_SCALE_X: 1 << 12,		/// スケールX
			PART_FLAG_SCALE_Y: 1 << 13,		/// スケールY
			PART_FLAG_OPACITY: 1 << 14,		/// 不透明度
			PART_FLAG_COLOR_BLEND: 1 << 15,		/// カラーブレンド
			PART_FLAG_VERTEX_TRANSFORM: 1 << 16,		/// 頂点変形
			PART_FLAG_SIZE_X: 1 << 17,		/// サイズX
			PART_FLAG_SIZE_Y: 1 << 18,		/// サイズY
			PART_FLAG_U_MOVE: 1 << 19,		/// UV移動X
			PART_FLAG_V_MOVE: 1 << 20,		/// UV移動Y
			PART_FLAG_UV_ROTATION: 1 << 21,		/// UV回転
			PART_FLAG_U_SCALE: 1 << 22,		/// UVスケールX
			PART_FLAG_V_SCALE: 1 << 23,		/// UVスケールY
			PART_FLAG_BOUNDINGRADIUS: 1 << 24,		/// 当たり半径
			PART_FLAG_INSTANCE_KEYFRAME: 1 << 25,		/// インスタンス
			PART_FLAG_INSTANCE_START: 1 << 26,		/// インスタンス：開始フレーム
			PART_FLAG_INSTANCE_END: 1 << 27,		/// インスタンス：終了フレーム
			PART_FLAG_INSTANCE_SPEED: 1 << 28,		/// インスタンス：再生速度
			PART_FLAG_INSTANCE_LOOP: 1 << 29,		/// インスタンス：ループ回数
			PART_FLAG_INSTANCE_LOOP_FLG: 1 << 30,		/// インスタンス：ループ設定

			NUM_PART_FLAGS: (1 << 30) + 1,

			VERTEX_FLAG_LT : 1 << 0,
			VERTEX_FLAG_RT : 1 << 1,
			VERTEX_FLAG_LB : 1 << 2,
			VERTEX_FLAG_RB : 1 << 3,
			VERTEX_FLAG_ONE : 1 << 4	// color blend only
		},

		rawData: null,
		SSBP_DATA_ID: 0x42505353,
		SSBP_DATA_VERSION: 3,
		ENDIAN: true, // true = little, false = big
		sprite: null,
		rc: 0,
		cellCache: {

			_texname: [],
			_textures: [],
			_refs: [],

			getReference: function(index){

				if( index < 0 || index >= this._refs.length){
					return null;
					//throw new Error("Index out of range >"+index);
				}

				var ref = this._refs[index];
				return ref;
			},
			init: function(imageBaseDir){

				var $ssbp = lib.ssbpManager;
				this._textures 	= [];
				this._texname 	= [];
				this._refs    	= [];

				// get cells
				var numCells = $ssbp.getNumCells();
				var cells = $ssbp.getCells();

				for(var i = 0; i < numCells; ++i){

					var cell = cells[i];
					var cellMap = cell.cellMap;
					if(cellMap.index >= this._textures.length ){
						var imagePath = cellMap.imagePath;
						this.addTexture(imagePath, imageBaseDir, cellMap.wrapmode, cellMap.filtermode);
					}

					//セル情報だけ入れておく
					//テクスチャの読み込みはゲーム側に任せる
					var ref = new $ssbp.CellRef();
					ref.cell = cell;
					ref.texture = this._textures[cellMap.index];
					ref.texname = this._texname[cellMap.index];
					ref.rect = new $ssbp.SSRect(cell.x, cell.y, cell.width, cell.height);
					this._refs.push(ref);
				}

				return this;
			},

			addTexture: function(imagePath, imageBaseDir, wrapmode, filtermode){

				var $ssbp = lib.ssbpManager;
				var path = "";
				if($ssbp.isAbsolutePath(imagePath)){

					path = imagePath;
				}else{

					path += imageBaseDir;
					var pathLen = path.length;
					if(pathLen && path[pathLen-1] != '/' && path[pathLen-1] != '\\'){
						path += "/";
					}
					path += imagePath;
				}

				// load texture. Since this is web based, program differently the texture load!
				var text = $ssbp.textureLoad();
				var texData = new $ssbp.TextureData();
				texData.handle = text;

				texData.sizeW = 0;
				texData.sizeH = 0;

				this._textures.push(texData);
				this._texname.push(path);

			}

		},
		effectCache: {
			_dic: {}, //std::map<std::string, SsEffectModel*>
			init: function(imageBaseDir, cellCache){
				$ssbp = lib.ssbpManager;

				var effectFileArray = $ssbp.getEffectFiles();
				var numEffect = $ssbp.getNumEffectFileList();

				for(var listindex = 0; listindex < numEffect; ++listindex){

					var effectFile = effectFileArray[listindex];
					var effectModel = new $ssbp.SsEffectModel();
					var effectFilename = effectFile.name;
					var effectNodeArray = effectFile.effectNode;

					for(let nodeindex = 0; nodeindex < effectFile.numNodeList; ++nodeindex){

						var effectNode = effectNodeArray[nodeindex];
						var node = new $ssbp.SsEffectNode();
						node.arrayIndex = effectNode.arrayIndex;
						node.parentIndex = effectNode.parentIndex;
						node.type = effectNode.type;
						node.visible = true;

						var behavior = new $ssbp.SsEffectBehavior();
						behavior.CellIndex = effectNode.cellIndex;

						var cellRef = behavior.CellIndex >= 0 ? cellCache.getReference(behavior.CellIndex) : null;

						if(cellRef){

							behavior.refCell.pivot_X = cellRef.cell.pivot_X;
							behavior.refCell.pivot_Y = cellRef.cell.pivot_Y;
							behavior.refCell.texture = cellRef.texture;
							behavior.refCell.texname = cellRef.texname;
							behavior.refCell.rect = cellRef.rect;
							behavior.refCell.cellIndex = behavior.CellIndex;
							var name = cellRef.cell.name;
							behavior.refCell.cellName = name;

						}

						behavior.blendType = effectNode.blendType;

						var behaviorArray = effectNode.Behavior;

						for(var behaviorindex = 0; behaviorindex < effectNode.numBehavior; ++behaviorindex){

							var behavior_adr = behaviorArray[behaviorindex];
							var reader = new $ssbp.DataArrayReader(this.rawData, behavior_adr);
							
							var type = reader.readS32();
							var SsEffectFunctionType = $ssbp.SsEffectFunctionType;

							switch(type){
								case SsEffectFunctionType.Basic:

									let readparam = new $ssbp.EffectParticleElementBasic();

									readparam.priority = reader.readU32();			//表示優先度
									readparam.maximumParticle = reader.readU32();		//最大パーティクル数
									readparam.attimeCreate = reader.readU32();		//一度に作成するパーティクル数
									readparam.interval = reader.readU32();			//生成間隔
									readparam.lifetime = reader.readU32();			//エミッター生存時間
									readparam.speedMinValue = reader.readFloat();		//初速最小
									readparam.speedMaxValue = reader.readFloat();		//初速最大
									readparam.lifespanMinValue = reader.readU32();	//パーティクル生存時間最小
									readparam.lifespanMaxValue = reader.readU32();	//パーティクル生存時間最大
									readparam.angle = reader.readFloat();				//射出方向
									readparam.angleVariance = reader.readFloat();		//射出方向範囲

									var effectParam = new $ssbp.ParticleElementBasic();
									effectParam.setType(type);											//コマンドの種類
									effectParam.priority = readparam.priority;							//表示優先度
									effectParam.maximumParticle = readparam.maximumParticle;			//最大パーティクル数
									effectParam.attimeCreate = readparam.attimeCreate;					//一度に作成するパーティクル数
									effectParam.interval = readparam.interval;							//生成間隔
									effectParam.lifetime = readparam.lifetime;							//エミッター生存時間
									effectParam.speed.setMinMax(readparam.speedMinValue, readparam.speedMaxValue);				//初速
									effectParam.lifespan.setMinMax(readparam.lifespanMinValue, readparam.lifespanMaxValue);	//パーティクル生存時間
									effectParam.angle = readparam.angle;								//射出方向
									effectParam.angleVariance = readparam.angleVariance;				//射出方向範囲

									behavior.plist.push(effectParam);
									break;

								case SsEffectFunctionType.RndSeedChange:

									readparam = new $ssbp.EffectParticleElementRndSeedChange();
									readparam.Seed = reader.readU32();

									effectParam = new $ssbp.ParticleElementRndSeedChange();
									effectParam.setType(type);
									effectParam.Seed = readparam.Seed;
									behavior.plist.push(effectParam);
									break;
								case SsEffectFunctionType.Delay:

									readparam = new $ssbp.EffectParticleElementDelay();
									readparam.DelayTime = reader.readU32();

									effectParam = new $ssbp.ParticleElementDelay();
									effectParam.setType(type);
									effectParam.DelayTime = readparam.DelayTime;
									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.Gravity:

									readparam = new $ssbp.EffectParticleElementGravity();
									readparam.Gravity_x = reader.readFloat();
									readparam.Gravity_y = reader.readFloat();

									effectParam = new $ssbp.ParticleElementGravity();
									effectParam.setType(type);
									effectParam.Gravity.x = readparam.Gravity_x;
									effectParam.Gravity.y = readparam.Gravity_y;
									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.Position:

									readparam = new $ssbp.EffectParticleElementPosition();

									readparam.OffsetXMinValue = reader.readFloat();	//X座標に加算最小
									readparam.OffsetXMaxValue = reader.readFloat();	//X座標に加算最大
									readparam.OffsetYMinValue = reader.readFloat();	//X座標に加算最小
									readparam.OffsetYMaxValue = reader.readFloat();	//X座標に加算最大

									effectParam = new $ssbp.ParticleElementPosition();
									effectParam.setType(type);				//コマンドの種類
									effectParam.OffsetX.setMinMax(readparam.OffsetXMinValue, readparam.OffsetXMaxValue); 	//X座標に加算最小
									effectParam.OffsetY.setMinMax(readparam.OffsetYMinValue, readparam.OffsetYMaxValue);	//X座標に加算最小

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.Rotation:

									readparam = new $ssbp.EffectParticleElementRotation();

									readparam.RotationMinValue = reader.readFloat();		//角度初期値最小
									readparam.RotationMaxValue = reader.readFloat();		//角度初期値最大
									readparam.RotationAddMinValue = reader.readFloat();	//角度初期加算値最小
									readparam.RotationAddMaxValue = reader.readFloat();	//角度初期加算値最大

									effectParam = new $ssbp.ParticleElementRotation();
									effectParam.setType(type);				//コマンドの種類
									effectParam.Rotation.setMinMax(readparam.RotationMinValue, readparam.RotationMaxValue);		//角度初期値最小
									effectParam.RotationAdd.setMinMax(readparam.RotationAddMinValue, readparam.RotationAddMaxValue);	//角度初期加算値最小

									behavior.plist.push(effectParam);												//パラメータを追加

									break;
								case SsEffectFunctionType.TransRotation:

									//Z回転速度変更
									readparam = new $ssbp.EffectParticleElementRotationTrans();
									readparam.RotationFactor = reader.readFloat();		//角度目標加算値
									readparam.EndLifeTimePer = reader.readFloat();		//到達時間

									effectParam = new $ssbp.ParticleElementRotationTrans();
									effectParam.setType(type);				//コマンドの種類
									effectParam.RotationFactor = readparam.RotationFactor;		//角度目標加算値
									effectParam.EndLifeTimePer = readparam.EndLifeTimePer;		//到達時間

									behavior.plist.push(effectParam);												//パラメータを追加

									break;
								case SsEffectFunctionType.TransSpeed:

									//速度：変化
									readparam = new $ssbp.EffectParticleElementTransSpeed();
									readparam.SpeedMinValue = reader.readFloat();			//速度目標値最小
									readparam.SpeedMaxValue = reader.readFloat();			//速度目標値最大

									effectParam = new $ssbp.ParticleElementTransSpeed();
									effectParam.setType(type);				//コマンドの種類
									effectParam.Speed.setMinMax(readparam.SpeedMinValue, readparam.SpeedMaxValue);			//速度目標値最小

									behavior.plist.push(effectParam);
									break;
								case SsEffectFunctionType.TangentialAcceleration:

									//接線加速度
									readparam = new $ssbp.EffectParticleElementTangentialAcceleration();
									readparam.AccelerationMinValue = reader.readFloat();	//設定加速度最小
									readparam.AccelerationMaxValue = reader.readFloat();	//設定加速度最大

									effectParam = new $sbbp.ParticleElementTangentialAcceleration();
									effectParam.setType(type);				//コマンドの種類
									effectParam.Acceleration.setMinMax(readparam.AccelerationMinValue, readparam.AccelerationMaxValue);	//設定加速度最小

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.InitColor:

									//カラーRGBA：生成時
									readparam = new $ssbp.EffectParticleElementInitColor();
									readparam.ColorMinValue = reader.readU32();			//設定カラー最小
									readparam.ColorMaxValue = reader.readU32();			//設定カラー最大

									effectParam = new $ssbp.ParticleElementInitColor();
									effectParam.setType(type);				//コマンドの種類

									var a = (readparam.ColorMinValue & 0xFF000000) >>> 24;
									var r = (readparam.ColorMinValue & 0x00FF0000) >>> 16;
									var g = (readparam.ColorMinValue & 0x0000FF00) >> 8;
									var b = (readparam.ColorMinValue & 0x000000FF) >> 0;

									var mincol = new $ssbp.SsTColor(r, g, b, a);

									a = (readparam.ColorMaxValue & 0xFF000000) >>> 24;
									r = (readparam.ColorMaxValue & 0x00FF0000) >>> 16;
									g = (readparam.ColorMaxValue & 0x0000FF00) >>> 8;
									b = (readparam.ColorMaxValue & 0x000000FF) >>> 0;

									var maxcol = new $ssbp.SsTColor(r, g, b, a);

									effectParam.Color.setMinMax(mincol, maxcol);			//設定カラー最小

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.TransColor:

									//カラーRGB：変化
									readparam = new $ssbp.EffectParticleElementTransColor();
									readparam.ColorMinValue = reader.readU32();			//設定カラー最小
									readparam.ColorMaxValue = reader.readU32();			//設定カラー最大

									effectParam = new $ssbp.ParticleElementTransColor();
									effectParam.setType(type);				//コマンドの種類

									var a = (readparam.ColorMinValue & 0xFF000000) >>> 24;
									var r = (readparam.ColorMinValue & 0x00FF0000) >>> 16;
									var g = (readparam.ColorMinValue & 0x0000FF00) >>> 8;
									var b = (readparam.ColorMinValue & 0x000000FF) >>> 0;

									var mincol = new $ssbp.SsTColor(r, g, b, a);


									a = (readparam.ColorMaxValue & 0xFF000000) >>> 24;
									r = (readparam.ColorMaxValue & 0x00FF0000) >>> 16;
									g = (readparam.ColorMaxValue & 0x0000FF00) >>> 8;
									b = (readparam.ColorMaxValue & 0x000000FF) >>> 0;

									var maxcol = new $ssbp.SsTColor(r, g, b, a);

									effectParam.Color.setMinMax(mincol, maxcol);			//設定カラー最小

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.AlphaFade:

									//フェード
									readparam = new $ssbp.EffectParticleElementAlphaFade();
									readparam.disprangeMinValue = reader.readFloat();		//表示区間開始
									readparam.disprangeMaxValue = reader.readFloat();		//表示区間終了

									effectParam = new $ssbp.ParticleElementAlphaFade();
									effectParam.setType(type);				//コマンドの種類
									effectParam.disprange.setMinMax(readparam.disprangeMinValue, readparam.disprangeMaxValue);		//表示区間開始

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.Size:

									//スケール：生成時
									readparam = new $ssbp.EffectParticleElementSize();
									readparam.SizeXMinValue = reader.readFloat();			//幅倍率最小
									readparam.SizeXMaxValue = reader.readFloat();			//幅倍率最大
									readparam.SizeYMinValue = reader.readFloat();			//高さ倍率最小
									readparam.SizeYMaxValue = reader.readFloat();			//高さ倍率最大
									readparam.ScaleFactorMinValue = reader.readFloat();		//倍率最小
									readparam.ScaleFactorMaxValue = reader.readFloat();		//倍率最大

									effectParam = new $ssbp.ParticleElementSize();
									effectParam.setType(type);				//コマンドの種類
									effectParam.SizeX.setMinMax(readparam.SizeXMinValue, readparam.SizeXMaxValue);			//幅倍率最小
									effectParam.SizeY.setMinMax(readparam.SizeYMinValue, readparam.SizeYMaxValue);			//高さ倍率最小
									effectParam.ScaleFactor.setMinMax(readparam.ScaleFactorMinValue, readparam.ScaleFactorMaxValue);		//倍率最小

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.TransSize:

									//スケール：変化
									readparam = new $ssbp.EffectParticleElementTransSize();
									readparam.SizeXMinValue = reader.readFloat();			//幅倍率最小
									readparam.SizeXMaxValue = reader.readFloat();			//幅倍率最大
									readparam.SizeYMinValue = reader.readFloat();			//高さ倍率最小
									readparam.SizeYMaxValue = reader.readFloat();			//高さ倍率最大
									readparam.ScaleFactorMinValue = reader.readFloat();		//倍率最小
									readparam.ScaleFactorMaxValue = reader.readFloat();		//倍率最大

									effectParam = new $ssbp.ParticleElementTransSize();
									effectParam.setType(type);				//コマンドの種類
									effectParam.SizeX.setMinMax(readparam.SizeXMinValue, readparam.SizeXMaxValue);			//幅倍率最小
									effectParam.SizeY.setMinMax(readparam.SizeYMinValue, readparam.SizeYMaxValue);			//高さ倍率最小
									effectParam.ScaleFactor.setMinMax(readparam.ScaleFactorMinValue, readparam.ScaleFactorMaxValue);		//倍率最小

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.PointGravity:

									//重力点の追加
									readparam = new $ssbp.EffectParticlePointGravity();
									readparam.Position_x = reader.readFloat();				//重力点X
									readparam.Position_y = reader.readFloat();				//重力点Y
									readparam.Power = reader.readFloat();					//パワー

									effectParam = new $ssbp.ParticlePointGravity();
									effectParam.setType(type);				//コマンドの種類
									effectParam.Position.x = readparam.Position_x;				//重力点X
									effectParam.Position.y = readparam.Position_y;				//重力点Y
									effectParam.Power = readparam.Power;					//パワー

									behavior.plist.push(effectParam);

									break;
								case SsEffectFunctionType.TurnToDirectionEnabled:

									//進行方向に向ける
									readparam = new $ssbp.EffectParticleTurnToDirectionEnabled();
									readparam.flag = reader.readS32();					//フラグ

									effectParam = new $ssbp.ParticleTurnToDirectionEnabled();
									effectParam.setType(type);				//コマンドの種類

									behavior.plist.push(effectParam);

									break;
								default:
									break;
							}

							node.behavior = behavior;
							effectModel.nodeList.push(node);
							if(nodeindex === 0){}

						}

						if (effectModel.nodeList.length > 0)
						{
							effectModel.root = effectModel.nodeList[0];	//rootノードを追加
							for (let i = 1; i < effectModel.nodeList.length; i++)
							{
								let pi =  effectModel.nodeList[i].parentIndex;
								if (pi >= 0)
								{
									effectModel.nodeList[pi].addChildEnd(effectModel.nodeList[i]);
								}
							}
						}
						effectModel.lockRandSeed = effectFile.lockRandSeed; // ランダムシード固定値
						effectModel.isLockRandSeed = effectFile.isLockRandSeed;  // ランダムシードを固定するか否か
						effectModel.fps = effectFile.fps;             //
						effectModel.effectName = effectFilename;


						console.log(`effect key: ${effectFilename}`);
						this._dic[effectFilename] = effectModel;

					}
				}

				return this;
			},
			getReference: function (name) {
				return this._dic[name];
			}
		},
		animeCache: {

			_dic: {}, //std::map<std::string, AnimeRef*>
			init: function () {

				$ssbp = lib.ssbpManager;

				var animePacks = $ssbp.getAnimePacks();
				var numAnumePacks = $ssbp.getNumAnimePacks();

				for (var packIndex = 0; packIndex < numAnumePacks; ++packIndex){

					var pack = animePacks[packIndex];

					var animations = pack.animations;
					var packName = pack.name;

					for (var animeIndex = 0; animeIndex < pack.numAnimations; ++animeIndex){

						var anime = animations[animeIndex];
						var animeName = anime.name;

						var animeRef = new $ssbp.AnimeRef();
						animeRef.packName = packName;
						animeRef.animeName = animeName;
						animeRef.animationData = anime;
						animeRef.animePackData = pack;

						var key = this.toPackAnimeKey(packName, animeName);

						console.log(`anime key ${key}`);

						this._dic[key] = animeRef;
					}
				}

				return this;

			},
			getReference: function (packName, animeName) {

				var key = this.toPackAnimeKey(packName, animeName);
				return this._dic[key];
			},

			toPackAnimeKey: function (packName, animeName) {

				return packName+animeName;
			}
		},	

		// check at the moment for windows
		isAbsolutePath: function(path){

			if(path.length >= 2 && ( (path[0] >= 'a' && path[0]) <= 'z' || (path[0] >= 'A' && path[0] <= 'Z' )) && path[1] == ':' )
				return true;
			else return false;

		},

		textureLoad: function(filename, wrapmode, filtermode){
			// at the moment return
			return 0 ;
			/**
			* テクスチャ管理用のユニークな値を返してください。
			* テクスチャの管理はゲーム側で行う形になります。
			* テクスチャにアクセスするハンドルや、テクスチャを割り当てたバッファ番号等になります。
			*
			* プレイヤーはここで返した値とパーツのステータスを引数に描画を行います。
			*/
			this.rc = 0;
			this.sprite.textures[rc++] = new lib.ssbpManager.Texture(filename);

			//SpriteStudioで設定されたテクスチャ設定を反映させるための分岐です。
			switch (wrapmode)
			{
			case 0: //SsTexWrapMode::clamp:	//クランプ
										//std::cout << "CLAMP\n";
				break;
			case 1: //SsTexWrapMode::repeat:	//リピート
										//std::cout << "REPEAT\n";
				break;
			case 2: //SsTexWrapMode::mirror:	//ミラー
										//std::cout << "MIRROR\n";
				break;
			}
			switch (filtermode)
			{
			case 0: //SsTexFilterMode::nearlest:	//ニアレストネイバー
											//std::cout << "NEAREST NEIGHBOR\n";
				break;
			case 1: //SsTexFilterMode::linear:	//リニア、バイリニア
											//std::cout << "BILINEAR\n";
				break;
			}

			return rc;
		},

		// Read functions
			readByte: function(offset){

				return this.rawData.getInt8(offset) & 0xFF;
			},

			readUByte: function(offset){
				return this.rawData.getUint8(offset) & 0xFF;
			},

			readCString: function(offset){

				var s = "";
				var c = this.readByte(offset);
				while(c != 0){
					s += String.fromCharCode(c);
					++offset;
					c = this.readByte(offset);
				}

				return s;
			},

			readShort: function(offset){
				return this.rawData.getInt16(offset, this.ENDIAN);
			},

			readUShort: function(offset){
				return this.rawData.getUint16(offset, this.ENDIAN) & 0xFFFF;
			},

			readInt: function(offset){
				return this.rawData.getInt32(offset, this.ENDIAN);
			},

			readUInt: function(offset){
				return this.rawData.getUint32(offset, this.ENDIAN) & 0xFFFFFFFF;
			},

			readFloat32: function(offset){
				return this.rawData.getFloat32(offset, this.ENDIAN);
			},

			readFloat64: function(offset){
				return this.rawData.getFloat64(offset, this.ENDIAN);
			},



		getRawData: function(){

			return this.rawData;
		},

		getSSBPData: function(){

			var offset = 0x00;
			return this.readInt(offset);
		},

		getSSBPVersion: function(){
			var offset = 0x04;
			return this.readUInt(offset);
		},

		getSSBPFlags: function(){
			var offset = 0x08;
			return this.readInt(offset);
		},

		getStringAddressImageBaseDir: function(){

			var offset = 0x0C;
			return this.readInt(offset);
		},

		getStartCellAddress: function(){
			var offset = 0x10;
			return this.readInt(offset);
		},

		getStartAnimePackAdress: function(){
			var offset = 0x14;
			return this.readInt(offset);
		},

		getStartAdressEffectFileList: function(){
			var offset = 0x18;
			return this.readInt(offset);
		},

		getNumCells: function(){
			var offset = 0x1C;
			return this.readUShort(offset);
		},

		getNumAnimePacks: function(){
			var offset = 0x1E;
			return this.readUShort(offset);
		},

		getNumEffectFileList: function(){
			var offset = 0x20;
			return this.readUShort(offset);
		},

		getImageBaseDir: function(){

			var offset = this.getStringAddressImageBaseDir();
			if(offset > 0)
				return this.readCString();
			else return "";
		},

		getCellData: function(offset){

		},

		getCellMap: function(offset){

			var cellMap = new lib.ssbpManager.CellMap();
			cellMap.nameAdress = offset;
			cellMap.name = this.readCString(this.readInt(offset));
			cellMap.imagePathAddress = this.readInt(offset + 0x04);
			cellMap.imagePath = this.readCString(cellMap.imagePathAddress);	// const char*
			cellMap.index = this.readInt(offset + 0x08);
			cellMap.wrapmode = this.readShort(offset + 0x0C); //ラップモード
			cellMap.filtermode = this.readShort(offset + 0x0E);	//フィルタモード
			cellMap.reserved = this.readShort(offset + 0x10);

			return cellMap;

		},

		getBehaviors: function(offset, num){

			var behaviorAddrs = [];
			for(var i = 0; i < num; ++i){

				var addr = this.readInt(offset);
				behaviorAddrs.push(addr);

				offset += 4;
			}

			return behaviorAddrs;

		},

		getEffectNode: function(offset){

			var effectNode = new lib.ssbpManager.EffectNode();

			effectNode.arrayIndex = this.readShort(offset);		//通し番号
			effectNode.parentIndex = this.readShort(offset + 0x02);	//親の番号
			effectNode.type = this.readShort(offset + 0x04);		//ノードの種類
			effectNode.cellIndex = this.readShort(offset + 0x06);		//セルの番号
			effectNode.blendType = this.readShort(offset + 0x08);		//描画方法
			effectNode.numBehavior = this.readShort(offset + 0x0A);	//コマンドパラメータ数
			effectNode.Behavior = this.getBehaviors(this.readInt(offset + 0x0C), effectNode.numBehavior);		//コマンド詳細

			return effectNode;

		},

		getCells: function(){

			var len = this.getNumCells();
			var cells = [];
			var offset = this.getStartCellAddress();
			for(var i = 0; i < len; ++i){

				var cell = new lib.ssbpManager.Cell();
				cell.nameAdress = offset;
				cell.name = this.readCString(this.readInt(offset));
				cell.cellMapAdress = this.readInt(offset + 0x04);
				cell.cellMap = this.getCellMap(cell.cellMapAdress);
				cell.indexInCellMap = this.readUShort( offset + 0x08);
				cell.x = this.readUShort( offset + 0x0A);
				cell.y = this.readUShort( offset + 0x0C);
				cell.width = this.readUShort( offset + 0x0E);
				cell.height = this.readUShort( offset + 0x10);
				cell.reserved = this.readShort( offset + 0x12);
				cell.pivot_X = this.readFloat32( offset + 0x14);
				cell.pivot_Y = this.readFloat32( offset + 0x18);

				offset += 0x1C;

				cells.push(cell);
			}

			return cells;
		},

		getAnimePacks: function(){

			var len = this.getNumAnimePacks();
			var animePacks = [];
			var offset = this.getStartAnimePackAdress();
			for(var i = 0; i < len; ++i){

				var animePack = new lib.ssbpManager.AnimePackData();
				animePack.nameAdress = offset;
				animePack.name = this.readCString(this.readInt(offset));
				animePack.partsAddress = this.readUInt(offset + 0x04);
				animePack.animationsAdress = this.readInt(offset + 0x08);

				animePack.numParts = this.readUShort(offset + 0x0C);
				animePack.numAnimations = this.readUShort(offset + 0x0E);

				animePack.animations = this.getAnimations(animePack.animationsAdress, animePack.numAnimations, animePack.numParts);

				animePack.parts = this.getAnimeParts(animePack.partsAddress, animePack.numParts);

				offset += 0x10;

				animePacks.push(animePack);
			}

			return animePacks;
		},

		getAnimations: function(offset, num, numParts){

			var animations = [];
			for(var i = 0; i < num; ++i){

				var anim = new lib.ssbpManager.AnimationData();

				anim.name = this.readCString(this.readInt(offset));

				anim.defaultDataAddress = this.readInt(offset + 0x04);
				anim.defaultData = this.getAnimationInitialData(anim.defaultDataAddress, numParts);
				anim.frameDataAddress = this.readInt(offset + 0x08); // address of pointers array
				anim.frameData = [];
				anim.userDataAddress = this.readInt(offset + 0x0C);
				anim.userData = [];
				anim.labelDataAddress = this.readInt(offset + 0x10);
				anim.labelData = [];
				anim.numFrames = this.readShort(offset + 0x14);
				anim.fps = this.readShort(offset + 0x16);
				anim.labelNum = this.readShort(offset + 0x18);
				anim.canvasSizeW = this.readShort(offset + 0x1A);
				anim.canvasSizeH = this.readShort(offset + 0x1C);

				anim.setFrameDataArrayPointers();
				anim.setUserDataArrayPointers();
				anim.setLabelDataArrayPointers();

				animations.push(anim);

				offset += 0x20;
			}

			return animations;
		},

		getAnimationInitialData: function(offset, numParts){

			var initData = [];
			for(var i = 0; i < numParts; ++i ) {
				var data = new lib.ssbpManager.AnimationInitialData();

				data.index = this.readShort(offset);
				data.dummy = this.readShort(offset + 0x02);
				data.flags = this.readUInt(offset + 0x04);
				data.cellIndex = this.readShort(offset + 0x08);
				data.positionX = this.readShort(offset + 0x0A);
				data.positionY = this.readShort(offset + 0x0C);
				data.positionZ = this.readShort(offset + 0x0E);
				data.opacity = this.readShort(offset + 0x10);

				data.pivotX = this.readFloat32(offset + 0x14);
				data.pivotY = this.readFloat32(offset + 0x18);
				data.rotationX = this.readFloat32(offset + 0x1C);
				data.rotationY = this.readFloat32(offset + 0x20);
				data.rotationZ = this.readFloat32(offset + 0x24);
				data.scaleX = this.readFloat32(offset + 0x28);
				data.scaleY = this.readFloat32(offset + 0x2C);
				data.size_X = this.readFloat32(offset + 0x30);
				data.size_Y = this.readFloat32(offset + 0x34);
				data.uv_move_X = this.readFloat32(offset + 0x38);
				data.uv_move_Y = this.readFloat32(offset + 0x3C);
				data.uv_rotation = this.readFloat32(offset + 0x40);
				data.uv_scale_X = this.readFloat32(offset + 0x44);
				data.uv_scale_Y = this.readFloat32(offset + 0x48);
				data.boundingRadius = this.readFloat32(offset + 0x4C);

				offset += 0x50;

				initData.push(data);
			}

			return initData;
		},

		getEffectFiles: function(){

			var len = this.getNumEffectFileList();
			var effectFiles = [];
			var offset = this.getStartAdressEffectFileList();
			for(var i = 0; i < len; ++i){

				var effectFile = new lib.ssbpManager.EffectFile();
				effectFile.nameAdress = offset;
				effectFile.name = this.readCString(this.readInt(offset));
				effectFile.fps = this.readShort(offset + 0x04);
				effectFile.isLockRandSeed = this.readShort( offset + 0x06);
				effectFile.lockRandSeed = this.readShort( offset + 0x08);
				effectFile.numNodeList = this.readShort( offset + 0x0A);
				effectFile.effectNodeAddress = this.readInt( offset + 0x0C);
				effectFile.effectNode = [];

				for(var j = 0; j < effectFile.numNodeList; ++j){
					var effNode = this.getEffectNode(effectFile.effectNodeAddress + 0x10*j);
					effectFile.effectNode.push(effNode);
				}
				

				offset += 0x10;

				effectFiles.push(effectFile);

			}

			return effectFiles;
		},

		getAnimeParts: function(offset, num){

			console.log(offset);
			console.log("NAME ADDR => " + this.readInt(offset));
			var parts = [];

			for(var i = 0; i < num; i++){

				var part = new lib.ssbpManager.PartData();

				part.name = this.readCString(this.readInt(offset));
				part.index = this.readShort(offset + 0x04);
				part.parentIndex = this.readShort(offset + 0x06);
				part.type = this.readShort(offset + 0x08);
				part.boundsType = this.readShort(offset + 0x0A);
				part.alphaBlendType = this.readShort(offset + 0x0C);

				// 0x0E and 0x0F are struct padding to align offset char*
				//console.log(this.readInt(offset + 0x0E));
				part.refname = this.readCString(this.readInt(offset + 0x10));
				part.effectfilename = this.readCString(this.readInt(offset + 0x14));
				part.colorLabel = this.readCString(this.readInt(offset + 0x18));

				parts.push(part);

				offset += 0x1C;
			}

			return parts;
		},

		init: function(dataArrayBuffer){

			this.rawData = new DataView(dataArrayBuffer);
			this.cellCache.init("");

		},
	}

	lib.ssbpManager.CellMap = function(){

		this.nameAdress = null;
		this.name = "";			// const char*
		this.imagePathAddress = null;
		this.imagePath = "";	// const char*
		this.index;
		this.wrapmode;		//ラップモード
		this.filtermode;	//フィルタモード
		this.reserved;

	};

	lib.ssbpManager.EffectFile = function(){

		this.nameAdress = null;
		this.name = "";			// const char* エフェクトファイル名
		this.fps = 0;			//FPS
		this.isLockRandSeed = 0;//乱数を固定するかどうか
		this.lockRandSeed = 0;	//固定する場合の乱数の種
		this.numNodeList = 0;	//含まれるノード数
		this.effectNode;		// const EffectNode*
		this.effectNodeAddress = null;
	};

	lib.ssbpManager.AnimePackData = function(){

		this.nameAdress = null; // const char*
		this.name = "";
		this.partsAddress = null;			
		this.parts = [];		// const PartData*
		this.animationsAdress = null;
		this.animations = [];	// const AnimationData*
		this.numParts = 0;
		this.numAnimations = 0;
	};

	lib.ssbpManager.PartData = function(){

		this.name = "";			/// const char*
		this.index = -1;			/// SS内のパーツインデックス
		this.parentIndex = -1;	/// 親のパーツインデックス
		this.type = 0;			/// パーツ種別
		this.boundsType = 0;		/// 当たり判定種類
		this.alphaBlendType = 0;	/// BlendType
		this.refname = "";		/// const char*　インスタンスとして配置されるアニメーション名
		this.effectfilename = "";	// const char*　参照するエフェクトファイル名
		this.colorLabel = "";		// const char*	カラーラベル

	};

	lib.ssbpManager.Cell = function(){

		this.nameAdress = null;
		this.name = "";
		this.cellMapAdress = null;
		this.cellMap = null;
		this.indexInCellMap = -1;
		this.x = 0;
		this.y = 0;
		this.width = 0;
		this.height = 0;
		this.reserved = 0;
		this.pivot_X = 0.0;
		this.pivot_Y = 0.0;
	};

	// CellRef struct
	lib.ssbpManager.CellRef = function(){

		this.cell = null;
		this.texture = null;
		this.rect = null;
		this.texname = "";
	}

	lib.ssbpManager.TextureData = function(){

		this.handle;
		this.sizeW;
		this.sizeH;
	}

	// see texture.h
	lib.ssbpManager.Texture = function(filename){

		this.openFile = function(){};
		this.retry = function(){};
		this.fileName = filename;
		this.width;
		this.height;
		this.nrChannels;
		this.id; // opengl
		this.message_on_fail;
		this.loaded;
		this.times_failed;
		this.last_slash;
		this.file = "";


	}

	lib.ssbpManager.SSRect = function(x, y, w, h){

		this.x = x;
		this.y = y;
		this.width = w;
		this.height = h;
	}

	lib.ssbpManager.EffectNode = function(){

		this.arrayIndex;		//通し番号
		this.parentIndex;	//親の番号
		this.type;			//ノードの種類
		this.cellIndex;		//セルの番号
		this.blendType;		//描画方法
		this.numBehavior;	//コマンドパラメータ数
		this.Behavior;		//コマンド詳細
	};

	lib.ssbpManager.SsEffectModel = function(){

		this.root = null;
		this.nodeList = [];
		this.lockRandSeed = 0; 	 // ランダムシード固定値
		this.isLockRandSeed = null;  // ランダムシードを固定するか否か
		this.fps = 0;             //
		this.bgcolor = null;
		this.effectName = "";

		this.getRoot = function(){
			 return this.root;
		}

	};

	lib.ssbpManager.SimpleTree = function(){

		this.parent = null;
		this.ctop = null;
		this.prev = null;
		this.next = null;

		this.addChildEnd = function(c){

			if(!this.ctop){
				this.ctop = c;
			}else{
				this.ctop.addSibilingEnd(c);
			}

			c.parent = this;
		};

		this.addSibilingEnd = function(c){

			if(!this.next){
				c.prev = this;
				this.next = c;
			}else{
				this.next.addSibilingEnd(c);
			}

			c.parent = this.parent;
		};

		this.destroysub = function(t){

			if(t.ctop){
				this.destroysub(t.ctop);
			}
			if(t.next){
				this.destroysub(t.next);
			}

			t.ctop = null;
			t.next = null;
			t.prev = null;
			delete t;
		};

		this.destroy = function(){

			if(this.ctop)
				this.destroysub(this.ctop);
		};
	};

	lib.ssbpManager.SsEffectNode = function(){ // extends SimpleTree

		this.parent = null;
		this.ctop = null;
		this.prev = null;
		this.next = null;

		this.arrayIndex = -1;
		this.parentIndex = -1;

		this.type = null;
		this.visible = null;
		this.behavior = null;

		this.getType = function(){

			return this.type
		};

		this.getMyBehavior = function(){

			return this.behavior;
		};

		this.addChildEnd = function(c){

			if(!this.ctop){
				this.ctop = c;
			}else{
				this.ctop.addSibilingEnd(c);
			}

			c.parent = this;
		};

		this.addSibilingEnd = function(c){

			if(!this.next){
				c.prev = this;
				this.next = c;
			}else{
				this.next.addSibilingEnd(c);
			}

			c.parent = this.parent;
		};

		this.destroysub = function(t){

			if(t.ctop){
				this.destroysub(t.ctop);
			}
			if(t.next){
				this.destroysub(t.next);
			}

			t.ctop = null;
			t.next = null;
			t.prev = null;
			delete t;
		};

		this.destroy = function(){

			if(this.ctop)
				this.destroysub(this.ctop);
		};
	};

	lib.ssbpManager.SsCell = function(){

		this.pivot_X = null;		//原点補正
		this.pivot_Y = null;		//原点補正
		this.texture = null;
		this.rect = null;
		this.texname = "";
		this.cellIndex = -1;
		this.cellName = "";
	};

	lib.ssbpManager.SsEffectBehavior = function(){

		this.plist = [];
		this.CellIndex = null;	//プレイヤー専用に追加
		this.refCell = new lib.ssbpManager.SsCell();
		this.CellName = "";
		this.CellMapName = "";
		this.blendType = null;
	};

	lib.ssbpManager.AnimeRef = function(){

		this.packName = "";
		this.animeName = "";
		this.animationData = null;
		this.animePackData = null;

	};

	lib.ssbpManager.AnimationData = function(){

		this.name = "";			// const char*
		this.defaultDataAddress = 0;
		this.defaultData = null;	// const AnimationInitialData*
		this.frameData = [];		// const ss_s16*
		this.frameDataAddress = null;  // const ss_offset
		this.userData = [];		// const ss_s16*
		this.userDataAddress = 0;
		this.labelData = [];		// const ss_s16*
		this.labelDataAddress = 0;
		this.numFrames = 0;
		this.fps = 0;
		this.labelNum = 0;
		this.canvasSizeW = 0;	//基準枠幅
		this.canvasSizeH = 0;	//基準枠高さ

		// set pointers array of frame data
		this.setFrameDataArrayPointers = function () {

			var $ssbp = lib.ssbpManager;
			var address = this.frameDataAddress;


			for (var i = 0; i < this.numFrames; ++i){
				var offset = $ssbp.readInt(address);
				this.frameData.push(offset);
				 address += 0x04;
			}
		};

		this.setUserDataArrayPointers = function () {

			var $ssbp = lib.ssbpManager;
			var address = this.userDataAddress;

			if(address <= 0) return;

			for (var i = 0; i < this.numFrames; ++i){
				var offset = $ssbp.readInt(address);
				this.userData.push(offset);
				address += 0x04;
			}
		};

		this.setLabelDataArrayPointers = function () {

			var $ssbp = lib.ssbpManager;
			var address = this.labelDataAddress;


			for (var i = 0; i < this.labelNum; ++i){
				var offset = $ssbp.readInt(address);
				this.labelData.push(offset);
				address += 0x04;
			}
		};

		// given a number of frame, return the address of frame data array
		this.getFrameDataArray = function (frameNo) {

			return this.frameData[frameNo];
		};
		
		this.getUserDataArray = function (frameNo) {
			
			return this.userData[frameNo];
		};
		
		this.getLabelDataArray = function (labelNum) {

			return this.labelData[labelNum];
		};
	};

	lib.ssbpManager.AnimationInitialData = function(){

		this.index = -1;
		this.dummy = 0;
		this.flags = 0;
		this.cellIndex = -1;
		this.positionX = 0;
		this.positionY = 0;
		this.positionZ = 0;
		this.opacity = 0;
		this.pivotX = 0.0;
		this.pivotY = 0.0;
		this.rotationX = 0.0;
		this.rotationY = 0.0;
		this.rotationZ = 0.0;
		this.scaleX = 0.0;
		this.scaleY = 0.0;
		this.size_X = 0.0;
		this.size_Y = 0.0;
		this.uv_move_X = 0.0;
		this.uv_move_Y = 0.0;
		this.uv_rotation = 0.0;
		this.uv_scale_X = 0.0;
		this.uv_scale_Y = 0.0;
		this.boundingRadius = 0.0;
	};

	lib.ssbpManager.SSColor4B = function()
	{
		this.a = 0;
		this.r = 0;
		this.g = 0;
		this.b = 0;
	};

	lib.ssbpManager.SsTColor = function(r,g,b,a)
	{
		if(typeof r === "object"){
			this.a = r.a;
			this.r = r.r;
			this.g = r.g;
			this.b = r.b;
		}else if(typeof r === "undefined") {
			this.a = 0;
			this.r = 0;
			this.g = 0;
			this.b = 0;
		}else{
			this.a = a;
			this.r = r;
			this.g = g;
			this.b = b;
		}

		this.fromARGB = function (c) {

			this.a = (c >>> 24) / 255;
			this.r = ((c >>> 16) & 0xff) / 255;
			this.g = ((c >>> 8) & 0xff) / 255;
			this.b = (c >>> 0 & 0xff) / 255;

		};

		this.fromBGRA = function (c) {

			this.b = (c >>> 24) / 255;
			this.g = ((c >>> 16) & 0xff) / 255;
			this.r = ((c >>> 8) & 0xff) / 255;
			this.a = (c >>> 0 & 0xff) / 255;

		};

		this.toARGB = function () {

			var c = (this.a * 255) << 24 | (this.r * 255) << 16 | (this.g * 255) << 8 | (this.b * 255);
			return c;
		};

		this.eq = function (rhs) {
			return this.r === rhs.r
				&& this.g === rhs.g
				&& this.b === rhs.b
				&& this.a === rhs.a;
		}

	};

	lib.ssbpManager.DataArrayReader = function(data, addr){

		this.data = data;
		this.addr = addr;
		this.ENDIAN = lib.ssbpManager.ENDIAN;

		this.readS16 =  function(){
			var d = this.data.getInt16(this.addr, this.ENDIAN);
			this.addr += 2;
			return d;
		};

		this.readU16 =  function(){
			var d =  this.data.getUint16(this.addr, this.ENDIAN) & 0xFFFF;
			this.addr += 2;
			return d;
		};

		this.readS32 = function(){

			var d = this.data.getInt32(this.addr, this.ENDIAN);
			this.addr += 4;
			return d;
		};

		this.readU32 = function(){

			var d = this.data.getUint32(this.addr, this.ENDIAN) & 0xFFFFFFFF;
			this.addr += 4;
			return d;
		};

		this.readFloat = function()
		{
			var d = this.data.getFloat32(this.addr, this.ENDIAN);
			this.addr += 4;
			return d;
		};

		this.readColor = function(/*SSColor4B& */color)
		{
			var d = this.readU32();
			color.a = (d >>> 24) & 0xFF;
			color.r = (d >>> 16) & 0xFF;
			color.g = (d >>> 8) & 0xFF;
			color.b = (d >>> 0) & 0xFF;
		};

		this.readOffset = function()
		{
			return this.readU32();
		};

		return this;
		
	};

	lib.ssbpManager.SsEffectFunctionType = {
		Base: 0,
		Basic: 1,
		RndSeedChange: 2 , 
		Delay: 3,
		Gravity: 4,
		Position: 5,
		Rotation: 6,
		TransRotation: 7,
		TransSpeed: 8,
		TangentialAcceleration: 9,
		InitColor: 10,
		TransColor: 11,
		AlphaFade: 12,
		Size: 13,
		TransSize: 14,
		PointGravity: 15,
		TurnToDirectionEnabled: 16,
	};

	lib.ssbpManager.EffectParticleElementBasic = function()
	{
		this.priority = 0;			//表示優先度
		this.maximumParticle = 0;	//最大パーティクル数
		this.attimeCreate = 0;		//一度に作成するパーティクル数
		this.interval = 0;			//生成間隔
		this.lifetime = 0;			//エミッター生存時間
		this.speedMinValue = 0;		//初速最小
		this.speedMaxValue = 0;		//初速最大
		this.lifespanMinValue = 0;	//パーティクル生存時間最小
		this.lifespanMaxValue = 0;	//パーティクル生存時間最大
		this.angle = 0;				//射出方向
		this.angleVariance = null;		//射出方向範囲
	};

	lib.ssbpManager.VarianceValue = function(v, v2)
	{
		this.RangeType = {
			None: 0,
			MinMax: 1,
			PlusMinus: 2
		};

		this.type = (typeof v2 === "undefined" ? this.RangeType.None : this.RangeType.PlusMinus);
		this.value = v;
		this.subvalue = (typeof v2 === "undefined" ? v : v2 );

		this.setPlusMinus = function(v)
		{
			this.value = -v;
			this.subvalue = v;
			this.type = this.RangeType.PlusMinus;

		};

		this.setMinMax = function(min, max)
		{
			this.value = min;
			this.subvalue = max;
			this.type = this.RangeType.MinMax;
		};

		this.getValue = function()
		{
			return this.value;
		};

		this.getMinValue = function()
		{
			return this.value;
		};

		this.getMaxValue = function()
		{
			return this.subvalue;
		};

		this.isTypeNone = function()
		{
			return this.type === this.RangeType.None;
		};

		this.isTypeMinMax = function()
		{
			return this.type === this.RangeType.MinMax;
		};

		this.isTypePlusMinus = function()
		{
			return this.type === this.RangeType.PlusMinus;
		};

	};

	lib.ssbpManager.ParticleElementBasic = function()
	{
		this.myType = lib.ssbpManager.SsEffectFunctionType.Basic;
		this.setType = function(type)
		{
			this.myType = type;
		};
		this.maximumParticle = 50;
		this.speed = new lib.ssbpManager.VarianceValue(5.0, 5.0);
		this.lifespan = new lib.ssbpManager.VarianceValue(30, 30);
		this.angle = 0.0;
		this.angleVariance = 45.0;
		this.interval = 1;
		this.lifetime = 30;
		this.attimeCreate = 1;
		this.priority = 64;
	};

	lib.ssbpManager.EffectParticleElementRndSeedChange = function () {

		this.Seed = 0;
	};

	lib.ssbpManager.ParticleElementRndSeedChange = function () {

		this.Seed = 0;
		this.myType = lib.ssbpManager.SsEffectFunctionType.RndSeedChange;
		this.setType = function(type)
		{
			this.myType = type;
		};
	};

	lib.ssbpManager.EffectParticleElementDelay = function () {

		this.DelayTime = 0;
	};

	lib.ssbpManager.ParticleElementDelay = function () {

		this.DelayTime = 0;
		this.myType = lib.ssbpManager.SsEffectFunctionType.Delay;
		this.setType = function (type) {
			this.myType = type;
		}
	};

	lib.ssbpManager.EffectParticleElementGravity = function () {

		this.Gravity_x = 0.0;
		this.Gravity_y = 0.0;
	};

	lib.ssbpManager.ParticleElementGravity = function () {

		this.Gravity = {
			x: 0.0,
			y: -3.0
		};

		this.myType = lib.ssbpManager.SsEffectFunctionType.Gravity;
		this.setType = function (type) {
			this.myType = type;
		};

	};

	lib.ssbpManager.EffectParticleElementPosition = function () {

		this.OffsetXMinValue = 0.0;		//X座標に加算最小
		this.OffsetXMaxValue = 0.0;		//X座標に加算最大
		this.OffsetYMinValue = 0.0;		//Y座標に加算最小
		this.OffsetYMaxValue = 0.0;		//Y座標に加算最大
	};

	lib.ssbpManager.ParticleElementPosition = function () {

		this.OffsetX = new lib.ssbpManager.VarianceValue(0,0);
		this.OffsetY = new lib.ssbpManager.VarianceValue(0,0);
		this.myType = lib.ssbpManager.SsEffectFunctionType.Position;
		this.setType = function (type) {
			this.myType = type;
		};
	};

	lib.ssbpManager.EffectParticleElementRotation = function () {
		this.RotationMinValue = 0.0;		//角度初期値最小
		this.RotationMaxValue = 0.0;		//角度初期値最大
		this.RotationAddMinValue = 0.0;	//角度初期加算値最小
		this.RotationAddMaxValue = 0.0;	//角度初期加算値最大
	};

	lib.ssbpManager.ParticleElementRotation = function () {

		this.Rotation = new lib.ssbpManager.VarianceValue(0,0);
		this.RotationAdd = new lib.ssbpManager.VarianceValue(0,0);

		this.myType = lib.ssbpManager.SsEffectFunctionType.Rotation;
		this.setType = function (type) {
			this.myType = type;
		};
	};

	lib.ssbpManager.EffectParticleElementRotationTrans = function()
	{
		this.RotationFactor = 0.0;			//角度目標加算値
		this.EndLifeTimePer = 0.0;			//到達時間
	};

	lib.ssbpManager.ParticleElementRotationTrans = function()
	{
		this.RotationFactor = 0.0;
		this.EndLifeTimePer = 75;

		this.myType = lib.ssbpManager.SsEffectFunctionType.TransRotation;
		this.setType = function (type) {
			this.myType = type;
		}
	};

	lib.ssbpManager.EffectParticleElementTransSpeed = function(){

		this.SpeedMinValue = 0.0;			//速度目標値最小
		this.SpeedMaxValue = 0.0;			//速度目標値最大
	};

	lib.ssbpManager.ParticleElementTransSpeed = function(){

		this.Speed = new lib.ssbpManager.VarianceValue(0,0);
		this.myType = lib.ssbpManager.SsEffectFunctionType.TransSpeed;
		this.setType = function (type) {
			this.myType = type;
		}
	};

	lib.ssbpManager.EffectParticleElementTangentialAcceleration = function(){

		this.AccelerationMinValue = 0.0;	//設定加速度最小
		this.AccelerationMaxValue = 0.0;	//設定加速度最大
	};

	lib.ssbpManager.ParticleElementTangentialAcceleration = function(){

		this.Acceleration = new lib.ssbpManager.VarianceValue(0,0);
		this.myType = lib.ssbpManager.SsEffectFunctionType.TangentialAcceleration;
		this.setType = function (type) {
			this.myType = type;
		}
	};

	lib.ssbpManager.EffectParticleElementInitColor = function(){

		this.ColorMinValue;			//設定カラー最小
		this.ColorMaxValue;			//設定カラー最大
	};

	lib.ssbpManager.ParticleElementInitColor = function(){

		this.Color = new lib.ssbpManager.VarianceValue(
			new lib.ssbpManager.SsTColor(255,255,255,255),
			new lib.ssbpManager.SsTColor(255,255,255,255)
		);

		this.myType = lib.ssbpManager.SsEffectFunctionType.InitColor;
		this.setType = function (type) {
			this.myType = type;
		};

	};

	lib.ssbpManager.EffectParticleElementTransColor = function(){

		this.ColorMinValue;			//設定カラー最小
		this.ColorMaxValue;			//設定カラー最大

	};

	lib.ssbpManager.ParticleElementTransColor = function(){

		this.Color = new lib.ssbpManager.VarianceValue(
			new lib.ssbpManager.SsTColor(255,255,255,255),
			new lib.ssbpManager.SsTColor(255,255,255,255)
		);

		this.myType = lib.ssbpManager.SsEffectFunctionType.TransColor;
		this.setType = function (type) {
			this.myType = type;
		};
	};

	lib.ssbpManager.EffectParticleElementAlphaFade = function(){

		this.disprangeMinValue;		//表示区間開始
		this.disprangeMaxValue;		//表示区間終了
	};

	lib.ssbpManager.ParticleElementAlphaFade = function(){

		this.disprange = new lib.ssbpManager.VarianceValue(25,75);
		this.myType = lib.ssbpManager.SsEffectFunctionType.AlphaFade;
		this.setType = function (type) {
			this.myType = type;
		}
	};

	lib.ssbpManager.EffectParticleElementSize = function(){

		this.SizeXMinValue;			//幅倍率最小
		this.SizeXMaxValue;			//幅倍率最大
		this.SizeYMinValue;			//高さ倍率最小
		this.SizeYMaxValue;			//高さ倍率最大
		this.ScaleFactorMinValue;	//倍率最小
		this.ScaleFactorMaxValue;	//倍率最大
	};

	lib.ssbpManager.ParticleElementSize = function(){

		this.SizeX = new lib.ssbpManager.VarianceValue(1.0, 1.0);
		this.SizeY = new lib.ssbpManager.VarianceValue(1.0, 1.0);
		this.ScaleFactor = new lib.ssbpManager.VarianceValue(1.0, 1.0);

		this.myType = lib.ssbpManager.SsEffectFunctionType.Size;
		this.setType = function (type) {
			this.myType = type;
		}
	};

	lib.ssbpManager.EffectParticleElementTransSize = function(){

		this.SizeXMinValue;			//幅倍率最小
		this.SizeXMaxValue;			//幅倍率最大
		this.SizeYMinValue;			//高さ倍率最小
		this.SizeYMaxValue;			//高さ倍率最大
		this.ScaleFactorMinValue;	//倍率最小
		this.ScaleFactorMaxValue;	//倍率最大

	};

	lib.ssbpManager.ParticleElementTransSize = function(){

		this.SizeX = new lib.ssbpManager.VarianceValue(1.0, 1.0);
		this.SizeY = new lib.ssbpManager.VarianceValue(1.0, 1.0);
		this.ScaleFactor = new lib.ssbpManager.VarianceValue(1.0, 1.0);

		this.myType = lib.ssbpManager.SsEffectFunctionType.Size;
		this.setType = function (type) {
			this.myType = type;
		}

	};

	lib.ssbpManager.EffectParticlePointGravity = function(){

		this.Position_x;				//重力点X
		this.Position_y;				//重力点Y
		this.Power;					//パワー

	};

	lib.ssbpManager.ParticlePointGravity = function (){

		this.Power = 0.0;
		this.Positon = {
			x: 0,
			y: 0
		};

		this.myType = lib.ssbpManager.SsEffectFunctionType.Gravity;
		this.setType = function (type) {
			this.myType = type;
		}

	};

	lib.ssbpManager.EffectParticleTurnToDirectionEnabled = function () {

		this.flag;
	}
	
	lib.ssbpManager.ParticleTurnToDirectionEnabled = function () {

		this.myType = lib.ssbpManager.SsEffectFunctionType.TurnToDirectionEnabled;
		this.setType = function (type) {
			this.myType = type;
		};
	}


	// Player

	lib.ssbpManager.Player = function (elem) {

		this.canvasElem = null;
		this.spritesheets = [];

		this.selfInject = function (e) {

			var width;
			var height;

			if(e instanceof jQuery){
				width = e.width();
				height = e.height();
			}else{
				width = e.width;
				height = e.height;
			}

			if(width < 512) width = 512;
			if(height < 512) height = 512;

			$(e).html(`<canvas width="${width}" height="${height}" class="ssbp-player"></canvas>`);

			this.canvasElem = $(e).find("canvas").get(0);
		};

		this.loadSpriteSheet = function (name, src) {

			this.spritesheets[name] = new lib.ssbpManager.Player.SpriteSheet(name, src);
			return this;
		};
		
		this.drawInitAnimation = function (animeName) {

			var ctx = this.canvasElem.getContext("2d");

			var $ssbp = lib.ssbpManager;

			var animeRef = $ssbp.animeCache.getReference("body_anim", animeName);

			var packData = animeRef.animePackData;

			var animeData = animeRef.animationData;

			var dataReader = new $ssbp.DataArrayReader($ssbp.rawData, animeData.frameData[0]);

			for(var i = 0; i < packData.parts.length; ++i){

				var animInitData = animeData.defaultData[i];

				var partIndex = dataReader.readS16();

				console.log(`partIndex => ${partIndex}`);


				var flags = dataReader.readU32();

				console.log(`flags => ${flags}`);

				var cellIndex = animInitData.cellIndex;

				console.log(`cellIndex => ${cellIndex}`);

				var cellIndex  = flags & $ssbp.flags.PART_FLAG_CELL_INDEX ? dataReader.readS16() : animInitData.cellIndex;
				var x          = flags & $ssbp.flags.PART_FLAG_POSITION_X ? dataReader.readS16() : animInitData.positionX;

				var y          = flags & $ssbp.flags.PART_FLAG_POSITION_Y ? dataReader.readS16() : animInitData.positionY;
				var z          = flags & $ssbp.flags.PART_FLAG_POSITION_Z ? dataReader.readS16() : animInitData.positionZ;

				var pivotX = flags & $ssbp.flags.PART_FLAG_PIVOT_X ? dataReader.readFloat() : animInitData.pivotX;
				var pivotY = flags & $ssbp.flags.PART_FLAG_PIVOT_Y ? dataReader.readFloat() : animInitData.pivotX;

				var rotationX = flags & $ssbp.flags.PART_FLAG_ROTATIONX ? dataReader.readFloat() : animInitData.rotationX;
				var rotationY = flags & $ssbp.flags.PART_FLAG_ROTATIONY ? dataReader.readFloat() : animInitData.rotationY;
				var rotationZ = flags & $ssbp.flags.PART_FLAG_ROTATIONZ ? dataReader.readFloat() : animInitData.rotationZ;

				var  scaleX = flags & $ssbp.flags.PART_FLAG_SCALE_X ? dataReader.readFloat() : animInitData.scaleX;
				var  scaleY   = flags & $ssbp.flags.PART_FLAG_SCALE_Y ? dataReader.readFloat() : animInitData.scaleY;
				var  opacity    = flags & $ssbp.flags.PART_FLAG_OPACITY ? dataReader.readU16() : animInitData.opacity;
				var  size_X   = flags & $ssbp.flags.PART_FLAG_SIZE_X ? dataReader.readFloat() : animInitData.size_X;
				var  size_Y   = flags & $ssbp.flags.PART_FLAG_SIZE_Y ? dataReader.readFloat() : animInitData.size_Y;
				var  uv_move_X   = flags & $ssbp.flags.PART_FLAG_U_MOVE ? dataReader.readFloat() : animInitData.uv_move_X;
				var  uv_move_Y   = flags & $ssbp.flags.PART_FLAG_V_MOVE ? dataReader.readFloat() : animInitData.uv_move_Y;
				var  uv_rotation = flags & $ssbp.flags.PART_FLAG_UV_ROTATION ? dataReader.readFloat() : animInitData.uv_rotation;
				var  uv_scale_X  = flags & $ssbp.flags.PART_FLAG_U_SCALE ? dataReader.readFloat() : animInitData.uv_scale_X;
				var  uv_scale_Y  = flags & $ssbp.flags.PART_FLAG_V_SCALE ? dataReader.readFloat() : animInitData.uv_scale_Y;
				var  boundingRadius = flags & $ssbp.flags.PART_FLAG_BOUNDINGRADIUS ? dataReader.readFloat() : animInitData.boundingRadius;


				var boundingRadius = animInitData.boundingRadius;

				x = x / 10;
				y = y / 10;
				z = z / 10;

				var cellRef = $ssbp.cellCache.getReference(cellIndex);

				if(cellRef){

					var cpx = 0;
					var cpy = 0;

					cpx = cellRef.cell.pivot_X;
					cpy = cellRef.cell.pivot_Y;

					pivotX += cpx;
					pivotY += cpy;
				}

				pivotX += 0.5;
				pivotY += 0.5;

				//ctx.drawImage(this.spritesheets.veronica, cellRef.cell.x, cellRef.cell.y, cellRef.cell.width, cellRef.cell.height, )
				/**
				 * .....
				 */

				if (flags & $ssbp.flags.PART_FLAG_VERTEX_TRANSFORM)
				{
					var vt_flags = dataReader.readU16();

					if (vt_flags & $ssbp.flags.VERTEX_FLAG_LT)
					{
						//quad.tl.vertices.x += reader.readS16();
						//quad.tl.vertices.y += reader.readS16();
						dataReader.readS16();
						dataReader.readS16();
					}
					if (vt_flags & $ssbp.flags.VERTEX_FLAG_RT)
					{
						// quad.tr.vertices.x += reader.readS16();
						// quad.tr.vertices.y += reader.readS16();

						dataReader.readS16();
						dataReader.readS16();
					}
					if (vt_flags & $ssbp.flags.VERTEX_FLAG_LB)
					{
						// quad.bl.vertices.x += reader.readS16();
						// quad.bl.vertices.y += reader.readS16();

						dataReader.readS16();
						dataReader.readS16();
					}
					if (vt_flags & $ssbp.flags.VERTEX_FLAG_RB)
					{
						// quad.br.vertices.x += reader.readS16();
						// quad.br.vertices.y += reader.readS16();

						dataReader.readS16();
						dataReader.readS16();
					}
				}

				/**
				 * If those dataReaders are not enough then add more logical condition to read the flags!
				 */

			}
		};

		this.selfInject(elem);

		return this;
	};

	lib.ssbpManager.Player.SpriteSheet = function (name, src) {

		this.image = new Image();
		this.name = name;
		this.cells = [];
		this.image.crossOrigin = "Anonymous";

		this.image.onload = function (event) {

			console.info("Image loaded.");
		};

		this.image.src = src;

		this.width = function () {

			return this.image.width;
		};

		this.height = function () {

			return this.image.height;
		};

		return this;

	};


})();