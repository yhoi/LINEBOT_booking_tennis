'use strict';
const express = require('express');
const line = require('@line/bot-sdk');
const PORT = 5000;
const request = require("request");
const cheerio = require("cheerio");
const agh = require('agh.sprintf');
const fs = require('fs');
const https = require('https');
require('dotenv').config()
const env = process.env;

console.log(env)

const options ={
  key: fs.readFileSync(env.HTTPS_KEY),
  cert: fs.readFileSync(env.HTTPS_CERT),
  ca: fs.readFileSync(env.HTTPS_CA)
}

const config = {
  channelSecret: env.LINECHANNEL_SECRET_BOOKING_AIZUTENNIS,
  channelAccessToken: env.LINECHANNEL_ACCESSTOKEN_BOOKING_AIZUTENNIS
};

//fetchHeadersForScrapingはスクレイピングに必要なheaderを返す関数
function fetchHeadersForScraping(){
  return new Promise(
    function(resolve,reject){
      const options = {
	url:'http://reserve.city.aizuwakamatsu.fukushima.jp/index.php',
	headers:{
	  'Set-Cookie':env.AIZUTENNIS_COOKIE,
	}
      }
      request(options,function(error,response,body){
	if(error){
	  reject(error);
	}
	else{
	  resolve(response.headers);
	}
      })
    }
  );
};

const app = express();
const server = https.createServer(options,app);

app.post('/webhook', line.middleware(config), (req, res) => {
  //受信したメッセージの情報をconsole	
  const messageObject = req.body.events[0];
  console.log(messageObject);
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result));
});

const client = new line.Client(config);

function genCourtOptions(headers,yearMonth,date){
  const options ={
    headers: {
      cookie: headers['set-cookie'][0],
    },
    uri: "http://reserve.city.aizuwakamatsu.fukushima.jp/index.php",
    form: {
      "op": "kensaku_koma",
      "UseYM":  yearMonth,
      "UseDay": date,
      "Type": "01",
      "Mokuteki01": "02",
      "ShisetsuCode": "0",
      "action.x":"145",
      "action.y":"4",
    },
  };
  return options; 
};

//printTimetableはコートの空き状況をtextとして返す関数
function genTextTimeTable($,scrapingCourtNum,scrapingCourtSize,courtNum,courtNumSize){
  let timetable =8;
  let text='';
  const FureaiCode=3;
  for(let i =courtNum;i<courtNumSize;i++){
    //ふれあいのみコートの表記がA・B
    if(courtNumSize== FureaiCode){
      if(i==courtNum) text += agh.sprintf(' コート番号  | %2s  |',"A");
      else text += agh.sprintf(' %2s  |','B');
    }
    else{
      if(i==courtNum) text += agh.sprintf(' コート番号  | %2d  |',i);
      else text += agh.sprintf(' %2d  |',i);
    }
  }
  text += '\n';
  //jはスクレイピングで取得するマークの指定
  for(let j=1;j<13;j++){
    //markStringはコートが空いているかのマークを代入
    timetable++;
    //kはスクレイピングで取得をするコート番号の指定
    for(let k=scrapingCourtNum;k<scrapingCourtSize;k++){
      const continueNumber=[18,13,25,32,35];
      //複数のコートを表示するところをcontinue
      //例　１・２コート　このような形で表示されているところ
      if( continueNumber.includes(k)){
      	continue;
      }
      else{
	      const x = $('.koma-table').eq(k);
	      let markString = $(x).find('td').eq(j).text();
        if(markString=='休館') markString='休';
	      else if(markString=='保守') markString='保';
	
	      if(k==scrapingCourtNum||k==26){
	        text += agh.sprintf("%2d時 ~ %2d時 |  %s  |",timetable,timetable+1,markString);
	      }
	      else{
	        text+= agh.sprintf("  %s  |",markString);
	      }
      }
    }
    text +='\n'; 
  }
  return text;
}

function fetchDomeScheduleText(headers,yearMonth,date){
  const options = genCourtOptions(headers,yearMonth,date);  
  return new Promise(
    function(resolve,reject){
      let text = yearMonth.substr(4,2)+'月'+date+'日\n';
      request.post(options,function(err, res, body){
      if (err) {
	      reject(err);
	    }
	    else {
        console.log(body)
	      text +='会津ドーム\n';
	      const $ = cheerio.load(body);
        /*マジックナンバーをなくす
	      const courtNum=1;
	      const courtNumSize = 5;
	      const ScrapingCourtNum=31;
        const ScrapingCourtSize=37;*/
	      text += genTextTimeTable($,31,37,1,5);
	    }
	    resolve(text);
    });
  });
};

function fetchHardScheduleText(headers,yearMonth,date){
  const options = genCourtOptions(headers,yearMonth,date);
  return new Promise(
    function(resolve,reject){
      let text = yearMonth.substr(4,2)+'月'+date+'日\n';
      request.post(options,function(err, res, body){
        if (err) {
          reject(err);
        }
        else {
          text +='市民ふれあいスポーツ広場\n';
          const $ = cheerio.load(body);
          console.log(body)
          /*マジックナンバーをなくす　
          const courtNum=1;
          const courtNumSize = 3;
          const ScrapingCourtNum=45;
          const ScrapingCourtSize=47;*/
	        text += genTextTimeTable($,45,47,1,3);
        }
        resolve(text);
      });
    }
  );
};

function fetchParkScheduleText(headers,yearMonth,date){
  return new Promise(
    function(resolve,reject){
      const options = genCourtOptions(headers,yearMonth,date);
      let text = yearMonth.substr(4,2)+'月'+date+'日\n';
      let courtNum=1;
      request.post(options,function(err, res, body) {
	    if (err) {
	      reject(err);
	    }
	    else {
	      text +='会津総合運動公園\n';
	      const $ = cheerio.load(body);
	      let ScrapingCourtNum=7;
	      let ScrapingCourtSize=11;
	      const continueCode = [11,16,25];
	      for(courtNum = 1;courtNum<=20;courtNum=courtNum+4){
	        text+=genTextTimeTable($,ScrapingCourtNum,ScrapingCourtSize,courtNum,courtNum+4);
	        text+='\n';
	        //continueする場合によってScrapingCourtNumとScrapingCourtSizeを変更する
	        if(continueCode.includes(ScrapingCourtSize)){
	          ScrapingCourtNum = ScrapingCourtSize;
	          ScrapingCourtSize = ScrapingCourtSize+5;
	        }
	        else if(ScrapingCourtSize == 21){
	          ScrapingCourtNum = ScrapingCourtSize;
	          ScrapingCourtSize= ScrapingCourtSize+4;
	        }
	      }	
	    }
	    resolve(text);
    });
  });
};

function genDateConfirmObject(place){ 
  return {
    "type": "template",
    "altText": "日程を決めてください",
    "template": {
      "type": "confirm",
      "text": "日程を決めてください",
      "actions": [
	      {
	      "type": "datetimepicker",
	      "label": "日程を決める",
	      "mode": "date",
	      "data": place
	      },
	      {
	      "type": "message",
	      "label": "キャンセル",
	      "text": "キャンセル"
	      },
      ]
    }
  };
};

server.listen(PORT);
console.log(`Server running at ${PORT}`);

async function handleEvent(event) {
  const scrapingHeaders = await fetchHeadersForScraping();
  let replyMessage = '';
  if (event.type !== 'message' && event.type !== 'postback') {
    return Promise.resolve(null);
  }
  //日付変更した日程を取得し、テーブル型で返信する
  else if (event.type === 'postback'){
    const receiveDate = event.postback.params.date;
    const scrapingForYearMonth = receiveDate.substr(0,4) + receiveDate.substr(5,2);
    const scrapingForDate = receiveDate.substr(8,2);
    if(event.postback.data==='AizuDome'){
      replyMessage += await fetchDomeScheduleText(scrapingHeaders,scrapingForYearMonth,scrapingForDate);
    }	
    else if(event.postback.data==='AizuPark'){
      replyMessage += await fetchParkScheduleText(scrapingHeaders,scrapingForYearMonth,scrapingForDate);
    }
    else if(event.postback.data==='AizuHard'){
      replyMessage += await fetchHardScheduleText(scrapingHeaders,scrapingForYearMonth,scrapingForDate);
    }
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyMessage
    });
  }

  else if (event.type === 'message' || event.message.type === 'text'){
    if(event.message.text === '会津ドーム'){
      const confirmObject = genDateConfirmObject('AizuDome');
      return client.replyMessage(event.replyToken,confirmObject);
    }
    else if(event.message.text === '会津総合運動公園'){
      const confirmObject = genDateConfirmObject('AizuPark');
      return client.replyMessage(event.replyToken,confirmObject);
    }
    else if(event.message.text === '市民ふれあいスポーツ広場'){
       const confirmObject = genDateConfirmObject('AizuHard');
       return client.replyMessage(event.replyToken,confirmObject);
    }
    else{
      replyMessage = '該当するテニスコートを入力してください\n 例（会津ドーム、会津総合運動公園)';
    }
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyMessage
    });
  } 
}

