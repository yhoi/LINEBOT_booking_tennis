'use strict';

const express = require('express');
const line = require('@line/bot-sdk');
const PORT = 3000;
const request = require("request");
const cheerio = require("cheerio");
const agh = require('agh.sprintf');
const fs = require('fs');
const https = require('https');
const env = process.env;

const options ={
  key: fs.readFileSync(env.HTTPS_KEY),
  cert: fs.readFileSync(env.HTTPS_CERT),
  ca: fs.readFileSync(env.HTTPS_CA)
}

const config = {
  channelSecret: env.LINECHANNEL_SECRET,
  channelAccessToken: env.LINECHANNEL_ACCESSTOKEN
};

function getHeaders(){
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
  console.log(req.body.events);

  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result));
});

const client = new line.Client(config);
//let i=0;
//let j=0;

function getYearMonthString(){
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth()+1;

  if(month<10){
    return `${year}0${month}`;
  }
  else{ 
    return `${year}${month}`;
  }
};

function setCourtOptions(headers){
  const date = new Date();
  const options ={
    headers: {
      cookie: headers['set-cookie'][0],
    },
    uri: "http://reserve.city.aizuwakamatsu.fukushima.jp/index.php",
    form: {
      "op": "kensaku_koma",
      "UseYM":  getYearMonthString(),
      "UseDay": date.getDate(),
      "Type": "01",
      "Mokuteki01": "02",
      "ShisetsuCode": "002",
      "action.x":"126",
      "action.y":"28",
    },
  };
  return options; 
};

function printTimetable($,courtNum,i){
  let timetable =8;
  let text='';
  text += agh.sprintf('%3sコート\n',courtNum);
  const x = $('.koma-table').eq(i);
  for(let j=1;j<13;j++){
    let mark = $(x).find('td').eq(j).text();
    timetable++;
    text += agh.sprintf('%2d時　～　%d時  |  %5s\n',timetable,timetable+1,mark);
  }
  text += '\n';
  return text;
}

function domeResult(headers){
  const options = setCourtOptions(headers);  
  return new Promise(
    function(resolve,reject){
      let text ='';
      let courtNum=1;
      request.post(options,function(err, res, body){
	if (err) {
	  reject(err);
	}
	else {
	  text +='  会津ドーム\n';
	  const $ = cheerio.load(body);
	  const length = $('.koma-table').length;
	  for(let i=26;i<length-1;i++){
	    if(i==27||i==30){
	      continue;
	    }
	    else{
	      text += printTimetable($,courtNum,i);
	      courtNum++; 
	    }
	  }  
	}
	resolve(text);
      });
    });
};

function parkResult(headers){
  const date = new Date();
  return new Promise(
    function(resolve,reject){
      const options = setCourtOptions(headers);
      let text ='';
      let courtNum=1;
      request.post(options,function(err, res, body) {
	if (err) {
	  reject(err);
	}
	else {
	  text +='   会津総合運動公園\n';
	  const $ = cheerio.load(body);
	  const length = $('.koma-table').length;
	  for(let i=2;i<=24;i++){
	    if(i==8||i==20||i==13){
	      continue;
	    }
	    else{
	      text+=printTimetable($,courtNum,i);
	      courtNum++;
	    }
	  }
	}
	resolve(text);	
      });
    });
};

server.listen(PORT);
console.log(`Server running at ${PORT}`);

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const headers = await getHeaders(); 
  let replyText = '';

  if(event.message.text === '会津ドーム'){
    replyText = 'コートの空き状況はこちら';
    replyText +=  await domeResult(headers);
  }
  else if(event.message.text === '会津総合運動公園'){
    replyText = 'コートの空き状況はこちら\n';
    replyText += await parkResult(headers);
  }
  else{
    replyText = '該当するテニスコートを入力してください\n 例（会津ドーム、会津総合運動公園)';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

