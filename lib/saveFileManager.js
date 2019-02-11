(function(){

	window.lib = window.lib || {};
	window.lib.saveFileManager = window.lib.saveFileManager || {};

	window.lib.saveFileManager = {

		rawData: null,
		saveBlockA: null,
		saveBlockB: null,
		littleEndian: true, /*read mode. if true littleEndian, else bigEndian*/
		propietaryEncoding: [
			[' ','À','Á','Â','Ç','È','É','Ê','Ë','Ì','こ','Î','Ï','Ò','Ó','Ô'],
			['Œ','Ù','Ú','Û','Ñ','ß','à','á','ね','ç','è','é','ê','ë','ì','ま'],
			['î','ï','ò','ó','ô','œ','ù','ú','û','ñ','º','ª','Character_0x2C_iii.png','&','+','あ'],
			['ぃ','ぅ','ぇ','ぉ','Lv','=','ょ','が','ぎ','ぐ','げ','ご','ざ','じ','ず','ぜ'],
			['ぞ','だ','ぢ','づ','で','ど','ば','び','ぶ','べ','ぼ','ぱ','ぴ','ぷ','ぺ','ぽ'],
			['っ','¿','¡','PK','MN','PO','Ké','Character 0x57_iii.png','Character_0x58_iii.png','Character_0x59_iii.png','Í','%','(',')','セ','ソ'],
			['タ','チ','ツ','テ','ト','ナ','ニ','ヌ','â','ノ','ハ','ヒ','フ','ヘ','ホ','í'],
			['ミ','ム','メ','モ','ヤ','ユ','ヨ','ラ','リ','⬆','⬇','⬅','➡','ヲ','ン','ァ'],
			['ィ','ゥ','ェ','ォ','ャ','ュ','ョ','ガ','ギ','グ','ゲ','ゴ','ザ','ジ','ズ','ゼ'],
			['ゾ','ダ','ヂ','ヅ','デ','ド','バ','ビ','ブ','ベ','ボ','パ','ピ','プ','ペ','ポ'],
			['ッ','0','1','2','3','4','5','6','7','8','9','!','?','.','-','・'],
			['…','“','”','‘','’','♂','♀','PokémonDollar.png',',','×','/','A','B','C','D','E'],
			['F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U'],
			['V','W','X','Y','Z','a','b','c','d','e','f','g','h','i','j','k'],
			['l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','▶'],
			[':','Ä','Ö','Ü','ä','ö','ü','⬆','⬇','⬅','0xFA','0xFB','0xFC','0xFD','0xFE','0xFF']
		],
		substructureOrder: [

			['GAEM','GAME','GEAM','GEMA','GMAE','GMEA'],
			['AGEM','AGME','AEGM','AEMG','AMGE','AMEG'],
			['EGAM','EGMA','EAGM','EAMG','EMGA','EMAG'],
			['MGAE','MGEA','MAGE','MAEG','MEGA','MEAG'],

		],

		getSubstructureOrder: function(PID){

			var idx = PID%24;

			var row = idx%4;
			var col = idx%6;

			return this.substructureOrder[row][col];

		},

		decryptPokemonData: function(OTID,PID,pokeData){

			var decryptedData = new DataView(new ArrayBuffer(48));
			var decryptKey = OTID ^ PID;
			var offset = 0;
			var checksum = 0;

			for(var i = 0;i<12;i++){
				offset = 4*i;
				decryptedData.setUint32(offset, ( (decryptKey ^ pokeData.getUint32(offset,this.littleEndian))>>>0) ,this.littleEndian );
				checksum += decryptedData.getUint16(offset,this.littleEndian);
				checksum += decryptedData.getUint16(offset+2,this.littleEndian);

			}

			checksum = checksum%0x10000;

			return {checksum: checksum, decryptedData:decryptedData};
		},

		languages: {

			JAP: 0x0201,
			ENG: 0x0202,
			FRE: 0x0203,
			ITA: 0x0204,
			GER: 0x0205,
			KOR: 0x0206,
			SPA: 0x0207
		},

		getLanguageCode: function(lang){

			lang = lang ? lang.toUpperCase().substring(0,3) : "ENG";

			return this.languages[lang];
		},

		getLanguageString: function(langCode){

			for(lang in this.languages){

				if(this.languages[lang] == langCode){
					return lang;
				}
			}
		},

		getInternationalChar: function(propietaryCharEncoding){

			var HI = ((propietaryCharEncoding & 0xF0) >> 4);
			var LO = propietaryCharEncoding & 0x0F;

			return this.propietaryEncoding[HI][LO];
		},

		trimControlCharacters: function(binaryString){

			return binaryString.replace(/0xFA|0xFB|0xFC|0xFD|0xFE|0xFF/gi,function(x){

				return "";
			});
		},

		/*Section format
		--------------------------------
		Offset | Size | Content
		---------------------------
		0x0000	 4080   Data
		0x0FF4	   2	Section ID
		0x0FF6	   2	Checksum
		0x0FFC	   4    Save index
		*/
		sectionIds: {

			0: 'trainerInfo',
			1: 'teamsItem',
			2: 'unknown1',
			3: 'unknown2',
			4: 'rivalInfo',
			5: 'pcBufferA',
			6: 'pcBufferB',
			7: 'pcBufferC',
			8: 'pcBufferD',
			9: 'pcBufferE',
			10: 'pcBufferF',
			11: 'pcBufferG',
			12: 'pcBufferH',
			13: 'pcBufferI'
		},

		sections: {

			trainerInfo: {

				size: 3884,
				data: null,
				offset: null,
			},
			teamsItem: {

				size :3968,
				data: null,
				offset: null,
			},
			unknown1: {

				size: 3968,
				data: null,
				offset: null,
			},
			unknown2: {

				size: 3968,
				data: null,
				offset: null,
			},
			rivalInfo: {

				size: 3848,
				data: null,
				offset: null,
			},
			pcBufferA: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferB: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferC: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferD: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferE: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferF: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferG: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferH: {

				size: 3968,
				data: null,
				offset: null,
			},
			pcBufferI: {

				size: 2000,
				data: null,
				offset: null,
			}

		},

		readFns: {

			getReadMode: function(){

				return lib.saveFileManager.littleEndian;
			},
			readSection: function(saveBlock,id){

				var offset = id*4096;
				var data = new DataView(saveBlock.buffer,offset,4096);
				lib.saveFileManager.sections[lib.saveFileManager.sectionIds[id]].data = data;
				lib.saveFileManager.sections[lib.saveFileManager.sectionIds[id]].offset = offset;
				return data;
			},

			readAllSections: function(saveBlock){

				$.each(lib.saveFileManager.sectionIds,function(id,name){

					var section = lib.saveFileManager.sections[name];
					var offset = 4096*id;
					section.data = new DataView(saveBlock.buffer,offset,4096);
					section.offset = offset;
				});
			},

			readSectionFooter: function(sectionId){

				var section = lib.saveFileManager.getSection(sectionId);
				var data = section.data;
				var curroffset = data.byteOffset;

				var sectionID = data.getUint16(0x0FF4,this.getReadMode());
				var checksum = data.getUint16(0x0FF6,this.getReadMode());
				var saveIndex = data.getUint32(0x0FFC,this.getReadMode());

				return {sectionID: sectionID, checksum: checksum, saveIndex: saveIndex};
			},

			getTrainerInfo: function(){

				var trainerInfo = {
					name: '',
					gender: null,
					trainerID: {
						PID: 0,
						SID: 0
					},
					timePlayed: {

						hours: 0,
						minutes: 0,
						seconds : 0,
						frames: 0
					},
					gameCode: null,
					securityKey: null
				};

				//No esq haya q coger rivalInfo pero al parecer las secciones estan desordenadas
				//Previamente habrá que leer las secciones y luego almazenarlas segun su orden
				var section = lib.saveFileManager.sections['rivalInfo'];
				var data = section.data;

				var offset = 0;
				var name = "";

				console.log("DUMPING TRAINER NAME...");
				/* Trainer name */
				while(offset < 7){

					trainerInfo.name += lib.saveFileManager.getInternationalChar(data.getUint8(offset));
					console.log("Char at ",offset, "=>",data.getUint8(offset));
					offset++;
				}

				trainerInfo.name = lib.saveFileManager.trimControlCharacters(trainerInfo.name);

				offset = 8;
				trainerInfo.gender = data.getUint8(offset);

				offset = 0x0A;

				var trainerID = data.getUint32(offset,this.getReadMode());
				trainerInfo.trainerID.SID = (trainerID & 0xFFFF0000)>>>16;
				trainerInfo.trainerID.PID = (trainerID & 0xFFFF)>>>0;

				offset = 0x0E;
				trainerInfo.timePlayed.hours = data.getUint16(offset,this.getReadMode());
				offset += 2;
				trainerInfo.timePlayed.minutes = data.getUint8(offset,this.getReadMode());
				offset++;
				trainerInfo.timePlayed.seconds = data.getUint8(offset);
				offset++;
				trainerInfo.timePlayed.frames = data.getUint8(offset);

				trainerInfo.gameCode = null;

				offset = 0xAC;
				trainerInfo.securityKey = data.getUint32(offset,this.getReadMode());

				return trainerInfo;
			},

			readPokemon: function(byteData){

				var pokemon = new Pokemon();
				var offset = 0;
				pokemon.setPID( byteData.getUint32(offset,this.getReadMode()) );
				offset += 4;

				pokemon.setOTID(byteData.getUint32(offset,this.getReadMode()) );
				offset += 4;

				/*Poke name*/
				var pokeName = "";
				while(offset < 18){

					pokeName += lib.saveFileManager.getInternationalChar(byteData.getUint8(offset));
					offset++;
				}

				pokemon.setNickname(pokeName);

				pokemon.setLanguage(byteData.getUint16(offset,this.getReadMode()));

				offset +=2;

				/* Trainer name */
				var otname = "";
				while(offset < 27){

					otname += lib.saveFileManager.getInternationalChar(byteData.getUint8(offset));
					offset++;
				}

				pokemon.setOTName(otname);

				var allMarks = byteData.getUint8(offset);
				var oMarks = {
					circle: false,
					square: false,
					triangle: false,
					heart: false
				};

				oMarks.circle = (allMarks & 0x1) == 1;
				oMarks.square = (allMarks & 0x2) == 1;
				oMarks.triangle = (allMarks & 0x4) == 1;
				oMarks.heart = (allMarks & 0x8) == 1;

				pokemon.setMarks(oMarks);

				offset++;

				pokemon.setChecksum(byteData.getUint16(offset,this.getReadMode()));

				offset += 2;

				//Skip 2 bytes
				offset += 2;
				//Data section

				var dataOffset = (byteData.byteOffset+offset);
				var buffer = byteData.buffer.slice(dataOffset,dataOffset+48);
				var data = new DataView(buffer);

				pokemon._setEncryptedData(data);

				var oDecrypted = lib.saveFileManager.decryptPokemonData(pokemon.getOTID().fullID, pokemon.getPID(), data);
				
				data = oDecrypted.decryptedData;
				
				console.log(oDecrypted);

				var dataOrder = lib.saveFileManager.getSubstructureOrder(pokemon.getPID());

				pokemon.setDataOrder(dataOrder);

				for(var i = 0;i<dataOrder.length;i++){

					var sec = dataOrder[i];
					var secOffset = i*12;
					switch(sec){

						//Growth
						case "G":

							var specie = data.getUint16(secOffset,this.getReadMode());
							pokemon.setData('specie',specie);
							secOffset += 2;
							var item = data.getUint16(secOffset,this.getReadMode());
							pokemon.setData('itemHeld',item);
							secOffset += 2;
							var exp = data.getUint32(secOffset,this.getReadMode());
							pokemon.setData('experience',exp);
							secOffset += 4;
							var ppBonus = data.getUint8(secOffset);
							pokemon.setData('ppBonus',ppBonus);
							secOffset += 1;
							var friendship = data.getUint8(secOffset);
							pokemon.setData('friendship',friendship);
							secOffset += 1;

							var unknown = data.getUint16(secOffset,this.getReadMode());
							pokemon.setData('unknown',unknown);
							secOffset += 2;


							break;
						//Attacks
						case "A":

							var move1 = data.getUint16(secOffset,this.getReadMode());
							secOffset += 2;
							var move2 = data.getUint16(secOffset,this.getReadMode());
							secOffset += 2;
							var move3 = data.getUint16(secOffset,this.getReadMode());
							secOffset += 2;
							var move4 = data.getUint16(secOffset,this.getReadMode());
							secOffset += 2;

							var pp1 = data.getUint8(secOffset);
							secOffset++;
							var pp2 = data.getUint8(secOffset);
							secOffset++;
							var pp3 = data.getUint8(secOffset);
							secOffset++;
							var pp4 = data.getUint8(secOffset);
							secOffset++;

							pokemon
							.setData('move1',{id:move1,pp:pp1})
							.setData('move2',{id:move2,pp:pp2})
							.setData('move3',{id:move3,pp:pp3})
							.setData('move4',{id:move4,pp:pp4});

							break;
						//Evs & Condition
						case "E":
							var EVS = {
								HP: 0,
								attack: 0,
								defense: 0,
								speed: 0,
								spAttack: 0,
								spDefense: 0
							};

							EVS.HP = data.getUint8(secOffset);
							secOffset++;
							EVS.attack = data.getUint8(secOffset);
							secOffset++;
							EVS.defense = data.getUint8(secOffset);
							secOffset++;
							EVS.speed = data.getUint8(secOffset);
							secOffset++;
							EVS.spAttack = data.getUint8(secOffset);
							secOffset++;
							EVS.spDefense = data.getUint8(secOffset);
							secOffset++;

							pokemon.setData('EVS',EVS);
							break;
						//Miscellaneous
						case "M":
							break;
					}
				}


				return pokemon;
			},

			getTeamAndItems: function(getFromSection){

				var teamsItem = {

					teamSize: 0,
					teamPokemonList: [],
					money: 0,
					pcItems: 0,
					itemsPocket: [],
					keyItemsPocket: [],
					ballItemsPocket: [],
					tmCase: [],
					berryPocket: [],
					addPokemon: function(oPokemon){

						this.teamPokemonList.push(oPokemon);
						return this;
					},
					getPokemonAt: function(teamIndex){

						return this.teamPokemonList[teamIndex];

					},
				};
 				
 				var sectionNames = Object.keys(lib.saveFileManager.sections);
				var section = typeof getFromSection !== "undefined" ? lib.saveFileManager.sections[sectionNames[getFromSection]] : lib.saveFileManager.sections['pcBufferA'];//pcBufferA
				var data = section.data;

				var offset = 0x234; //Team size

				teamsItem.teamSize = data.getUint32(offset,this.getReadMode());

				offset = section.offset+0x238; //First team pokemon


				for(var i=0;i<teamsItem.teamSize;i++){

					var pokeData = new DataView(data.buffer,offset,100);
					var oPoke = this.readPokemon(pokeData);
					teamsItem.addPokemon(oPoke);
					offset += 100;
				}

				return teamsItem;
			}

		},

		getSection: function(sectionId){

			return this.sections[this.sectionIds[sectionId]];
		},

		getSaveIndex: function(saveBlock){

			var sec = this.readFns.readSection(saveBlock,0);
			var index = sec.getUint16(0x0FF4,this.littleEndian);

			return index;
		},

		getRawData: function(){

			return this.rawData;
		},

		setSaveBlockA: function(dataArrayBuffer){

			this.saveBlockA = new DataView(dataArrayBuffer,0,57344);
			return this;
		},

		getSaveBlockA: function(){

			return this.saveBlockA;
		},

		getSaveBlockB: function(){

			return this.saveBlockB;
		},

		setSaveBlockB: function(dataArrayBuffer){

			this.saveBlockB = new DataView(dataArrayBuffer,57344,57344);
			return this;
		},

		getLastSaveBlock: function(){

			var idx1 = this.getSaveIndex(this.getSaveBlockA());
			var idx2 = this.getSaveIndex(this.getSaveBlockB());

			console.log("indexA =>",idx1, "| indexB =>", idx2);

			if(idx1 >= idx2){

				return "A";
			}else{
				return "B";
			}

		},

		calcChecksum: function(sectionId){

			var section = this.getSection(sectionId);

			var size = section.size;
			var data = section.data;

			var checksum = 0;

			var offset = 0;
			while(offset < size){

				checksum += data.getUint32(offset,this.littleEndian);
				offset += 4;
			}

			var HIChecksum = ((checksum & 0xFFFF0000) >> 16);
			var LOChecksum = checksum & 0x0000FFFF;

			return (HIChecksum + LOChecksum);

		},

		init: function(dataArrayBuffer){

			this.rawData = new DataView(dataArrayBuffer);

			this.setSaveBlockA(dataArrayBuffer);
			this.setSaveBlockB(dataArrayBuffer);

			//check the newest saveBlock
			var lastBlock = this.getLastSaveBlock();

			this.readFns.readAllSections( lastBlock == "A" ? this.getSaveBlockA() : this.getSaveBlockB());


		},
	};

	/* class pokemon */
	var Pokemon = function(){

		this.PID = 0;
		this.OTID = {

			ID: 0, /* & 0xFFFF */
			SID:0, /* (& 0xFFFF0000) >>> 16 */
			fullID:0 /* 32bits full */
		};
		this.nickname = '';
		this.language = 0x0202; /* posible values: 0x0201 JAP, 0x0202 ENG, 0x0203 FRE, 0x0204 ITA, 0x0205 GER, 0x..6 KOR, 0x..7 SPA*/
		this.OTName = '';
		this.marks = {

			circle: false,
			square: false,
			triangle: false,
			heart: false
		};
		this.checksum = 0;
		this._encryptedData = null;
		this.dataOrder = "";
		this.data = {

			/*GROWTH*/
			specie: 0,
			itemHeld: 0,
			experience: 0,
			ppBonus: 0,
			friendship: 0,
			unknown: 0,
			/*ATTACKS*/
			move1: {
				id: 0,
				pp: 0
			},
			move2: {
				id: 0,
				pp: 0
			},
			move3: {
				id: 0,
				pp: 0
			},
			move4: {
				id: 0,
				pp: 0
			},
			/* EVS & Condition*/
			EVS: {
				HP: 0,
				attack: 0,
				defense: 0,
				speed: 0,
				spAttack: 0,
				spDefense: 0
			},
			coolness: 0,
			beauty: 0,
			cuteness: 0,
			smartness: 0,
			toughness: 0,
			feel: 0,
			/*Miscellaneous*/
			pokerusStatus: 0,
			metLocation: 0,
			originInfo: 0,
			IVS: {
				attack: 0,
				defense: 0,
				speed: 0,
				spAttack: 0,
				spDefense: 0
			},
			egg: null,
			ability: 0,
			ribbons: {

			},
			obedience: 0

		};

		this.teamData = {
			status: 0,
			level: 0,
			pokerusRemaining: 0,
			currentHP: 0,
			totalHP: 0,
			attack: 0,
			defense: 0,
			speed: 0,
			spAttack: 0,
			spDefense: 0,
			//..... More to add
		};

		this.setPID = function(pid){

			this.PID = pid;
			return this;

		};

		this.getPID = function(){

			return this.PID;
		};

		this.setOTID = function(otid){

			this.OTID.fullID = otid;
			this.OTID.ID = (otid & 0xFFFF);
			this.OTID.SID = ((otid & 0xFFFF0000) >>> 16);
			return this;
		};

		this.getOTID = function(){

			return this.OTID;
		};

		this.setNickname = function(nickname){

			this.nickname = nickname;
			return this;
		};

		this.getNickname = function(){

			return this.nickname;
		};

		this.setLanguage = function(lang){

			if(typeof lang == "string"){

				this.language = lib.saveFileManager.getLanguageCode(lang);
			}else{
				this.language = lang;
			}

			return this;
		};

		this.getLanguage = function(asString){

			return asString ? lib.saveFileManager.getLanguageString(this.language) : this.language;
		};

		this.setOTName = function(otname){

			this.OTName = otname;
			return this;

		};

		this.getOTName = function(){

			return this.OTName;
		};

		this.setMarks = function(oMarks){

			this.marks = oMarks;
			return this;
		};

		this.getMarks = function(){

			return this.marks;
		};

		this.setChecksum = function(checksum){

			this.checksum = checksum;
			return this;
		};

		this.getChecksum = function(){

			return this.checksum;
		};

		this._setEncryptedData = function(data){

			this._encryptedData = data;
			return this;
		};

		this._getEncryptedData = function(){

			return this._encryptedData;
		};

		this.setDataOrder = function(order){

			this.dataOrder = order;
			return this;
		};

		this.getDataOrder = function(){

			return this.dataOrder;
		};

		this.setData = function(field,param){

			this.data[field] = param;
			return this;

		};

		this.getData = function(field){

			return field ? this.data[field] : this.data;
		};
	};


})();