/**
 * Created by Il Yeup, Ahn in KETI on 2020-09-04.
 */

/**
 * Copyright (c) 2020, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

    // for TAS of mission

let mqtt = require('mqtt');
let fs = require('fs');
const {exec, spawn} = require('child_process')
const {nanoid} = require('nanoid');
const util = require("util");
const db = require('node-localdb');
require("moment-timezone");
const moment = require('moment');
moment.tz.setDefault("Asia/Seoul");

global.sh_man = require('./http_man');

let fc = {};
let config = {};

config.name = 'msw_lte';
global.drone_info = '';

let lte_data = db('./' + config.name + '_data' + '.json');

try {
    drone_info = JSON.parse(fs.readFileSync('../drone_info.json', 'utf8'));

    config.directory_name = config.name + '_' + config.name;
    // config.sortie_name = '/' + sortie_name;
    config.gcs = drone_info.gcs;
    config.drone = drone_info.drone;
    config.lib = [];
}
catch (e) {
    // config.sortie_name = '';
    config.directory_name = '';
    config.gcs = 'KETI_MUV';
    config.drone = 'FC_MUV_01';
    config.lib = [];
}

// library 추가
let add_lib = {};
try {
    add_lib = JSON.parse(fs.readFileSync('./lib_lte.json', 'utf8'));
    config.lib.push(add_lib);
}
catch (e) {
    add_lib = {
        name: 'lib_lte',
        target: 'armv6',
        description: "[name] [portnum] [baudrate]",
        scripts: './lib_lte /dev/ttyUSB2 57600',
        data: ['LTE'],
        control: []
    };
    config.lib.push(add_lib);
}

// msw가 muv로 부터 트리거를 받는 용도
// 명세에 sub_container 로 표기
let msw_sub_mobius_topic = [];

let msw_sub_fc_topic = [];
// msw_sub_fc_topic.push('/TELE/drone/hb');
msw_sub_fc_topic.push('/od/tele/broadcast/man/gpi/orig');
msw_sub_fc_topic.push('/od/tele/relay/man/sortie/orig');

let msw_sub_lib_topic = [];

let my_sortie_name = 'disarm';

function init() {
    if (config.lib.length > 0) {
        for (let idx in config.lib) {
            if (config.lib.hasOwnProperty(idx)) {
                if (msw_mqtt_client != null) {
                    for (let i = 0; i < config.lib[idx].control.length; i++) {
                        let sub_container_name = config.lib[idx].control[i];
                        let _topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + +'/' + config.name + '/' + sub_container_name;
                        msw_mqtt_client.subscribe(_topic);
                        msw_sub_mobius_topic.push(_topic);
                        console.log('[msw_mqtt] msw_sub_mobius_topic[' + i + ']: ' + _topic);
                    }

                    for (let i = 0; i < config.lib[idx].data.length; i++) {
                        let container_name = config.lib[idx].data[i];
                        let _topic = '/MUV/data/' + config.lib[idx].name + '/' + container_name;
                        dr_mqtt_client.subscribe(_topic);
                        msw_sub_lib_topic.push(_topic);
                        console.log('[lib_mqtt] msw_sub_lib_topic[' + i + ']: ' + _topic);
                    }
                }

                let obj_lib = config.lib[idx];
                setTimeout(runLib, 1000 + parseInt(Math.random() * 10), JSON.parse(JSON.stringify(obj_lib)));
            }
        }
    }
}

function runLib(obj_lib) {
    try {
        if (drone_info.hasOwnProperty('lte')) {
            if (drone_info.lte.toUpperCase() === "AM") {
                obj_lib.scripts = './lib_lte /dev/ttyUSB3 115200';
            }
            else if (drone_info.lte.toUpperCase() === "QUECTEL") {
                obj_lib.scripts = './lib_lte /dev/ttyUSB2 57600';
            }
            else {
                obj_lib.scripts = obj_lib.scripts;
            }
        }
        else {
            obj_lib.scripts = obj_lib.scripts;
        }

        let scripts_arr = obj_lib.scripts.split(' ');

        let run_lib = spawn(scripts_arr[0], scripts_arr.slice(1));

        run_lib.stdout.on('data', function (data) {
            console.log('stdout: ' + data);
        });

        run_lib.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });

        run_lib.on('exit', function (code) {
            console.log('exit: ' + code);

            setTimeout(runLib, 3000, obj_lib)
        });

        run_lib.on('error', function (code) {
            console.log('error: ' + code);
        });
    }
    catch (e) {
        console.log(e.message);
    }
}

let msw_mqtt_client = null;

msw_mqtt_connect(drone_info.host, 1883);

function msw_mqtt_connect(broker_ip, port) {
    if (msw_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'mqttjs_' + config.drone + '_' + config.name + '_' + nanoid(15),
            protocolId: "MQTT",
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        msw_mqtt_client = mqtt.connect(connectOptions);

        msw_mqtt_client.on('connect', function () {
            console.log('[msw_mqtt_connect] connected to ' + broker_ip);
            let noti_topic = util.format('/oneM2M/req/+/S%s/#', drone_info.id);
            msw_mqtt_client.subscribe(noti_topic, function () {
                console.log('[msw_mqtt_connect] noti_topic is subscribed:  ' + noti_topic);
            });
        });

        msw_mqtt_client.on('message', function (topic, message) {
            if (msw_sub_mobius_topic.includes(topic)) {
                setTimeout(on_receive_from_muv, parseInt(Math.random() * 5), topic, message.toString());
            }
            else {
                if (topic.includes('/oneM2M/req/')) {
                    var jsonObj = JSON.parse(message.toString());

                    let patharr = jsonObj.pc['m2m:sgn'].sur.split('/');
                    let lib_ctl_topic = '/MUV/control/' + patharr[patharr.length - 3].replace('msw_', 'lib_') + '/' + patharr[patharr.length - 2];

                    if (patharr[patharr.length - 3] === config.name) {
                        if (jsonObj.pc['m2m:sgn'].nev) {
                            if (jsonObj.pc['m2m:sgn'].nev.rep) {
                                if (jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']) {
                                    let cinObj = jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']
                                    if (getType(cinObj.con) == 'string') {
                                        on_receive_from_muv(lib_ctl_topic, cinObj.con);
                                    }
                                    else {
                                        on_receive_from_muv(lib_ctl_topic, JSON.stringify(cinObj.con));
                                    }
                                }
                            }
                        }
                    }
                }
                else {
                }
            }
        });

        msw_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

let dr_mqtt_client = null;

dr_mqtt_connect('localhost', 1883);

function dr_mqtt_connect(broker_ip, port) {
    if (dr_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'dr_mqtt_client_mqttjs_' + config.drone + '_' + config.name + '_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        dr_mqtt_client = mqtt.connect(connectOptions);

        dr_mqtt_client.on('connect', function () {
            console.log('[dr_mqtt_connect] connected to ' + broker_ip);
            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    dr_mqtt_client.subscribe(msw_sub_fc_topic[idx]);
                    console.log('[local_msw_mqtt] msw_sub_fc_topic[' + idx + ']: ' + msw_sub_fc_topic[idx]);
                }
            }
        });

        dr_mqtt_client.on('message', function (topic, message) {
            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    if (topic === msw_sub_fc_topic[idx]) {
                        setTimeout(on_process_fc_data, parseInt(Math.random() * 5), topic, message.toString());
                        break;
                    }
                }
            }
            for (let idx in msw_sub_lib_topic) {
                if (msw_sub_lib_topic.hasOwnProperty(idx)) {
                    if (topic === msw_sub_lib_topic[idx]) {
                        setTimeout(on_receive_from_lib, parseInt(Math.random() * 5), topic, message.toString());
                        break;
                    }
                }
            }
        });

        dr_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function on_receive_from_muv(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseControlMission(topic, str_message);
}

function on_receive_from_lib(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseDataMission(topic, str_message);
}

function on_process_fc_data(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseFcData(topic, str_message);
}

setTimeout(init, 1000);

// 유저 디파인 미션 소프트웨어 기능
///////////////////////////////////////////////////////////////////////////////
function parseDataMission(topic, str_message) {
    try {
        // User define Code
        let obj_lib_data = JSON.parse(str_message);
        if (fc.hasOwnProperty('gpi')) {
            Object.assign(obj_lib_data, JSON.parse(JSON.stringify(fc['gpi'])));
        }
        str_message = JSON.stringify(obj_lib_data);
        ///////////////////////////////////////////////////////////////////////

        let topic_arr = topic.split('/');
        let data_topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + topic_arr[topic_arr.length - 1] + '/orig';
        // msw_mqtt_client.publish(data_topic + '/' + sortie_name, str_message);
        dr_mqtt_client.publish(data_topic, str_message);
        data_topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + topic_arr[topic_arr.length - 1] + '/' + my_sortie_name;
        sh_man.crtci(data_topic + '?rcn=0', 0, JSON.parse(str_message), null, function (rsc, res_body, parent, socket) {
            if (rsc === '2001') {
                setTimeout(mon_local_db, 500, data_topic);
            }
            else {
                lte_data.insert(JSON.parse(str_message));
            }
        });
    }
    catch (e) {
        console.log(e)
        console.log('[parseDataMission] data format of lib is not json');
    }
}

///////////////////////////////////////////////////////////////////////////////

function parseControlMission(topic, str_message) {
    try {
        let topic_arr = topic.split('/');
        let _topic = '/MUV/control/' + config.lib[0].name + '/' + topic_arr[topic_arr.length - 1];
        dr_mqtt_client.publish(_topic, str_message);
    }
    catch (e) {
        console.log('[parseControlMission] data format of lib is not json');
    }
}

function parseFcData(topic, str_message) {
    let topic_arr = topic.split('/');
    if (topic_arr[topic_arr.length - 2] !== 'sortie') {
        fc[topic_arr[topic_arr.length - 2]] = JSON.parse(str_message);
    }
    else { // sortie_topic
        let arr_message = str_message.toString().split(':');
        let _my_sortie_name = arr_message[0];

        if (_my_sortie_name === 'unknown-arm') { // 시작될 때 이미 드론이 시동이 걸린 상태
            // 모비우스 조회해서 현재 sortie를 찾아서 설정함
            let path = 'http://192.168.' + drone_info.system_id + '.' + (parseInt(drone_info.system_id) - 1) + ':7579/Mobius/' + drone_info.gcs + '/Drone_Data/' + drone_info.drone;
            let cra = moment().utc().format('YYYYMMDD');

            sh_man.getSortieLatest(path, cra, (status, uril) => {
                if (status !== 9999) {
                    if (uril.length === 0) {
                        // 현재 시동이 걸린 상태인데 오늘 생성된 sortie가 없다는 뜻이므로 새로 만듦
                        my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
                    }
                    else {
                        my_sortie_name = uril[0].split('/')[4];
                    }
                }
                else {
                    path = 'http://' + drone_info.host + ':7579/Mobius/' + drone_info.gcs + '/Drone_Data/' + drone_info.drone;

                    sh_man.getSortieLatest(path, cra, (status, uril) => {
                        if (uril.length === 0) {
                            // 현재 시동이 걸린 상태인데 오늘 생성된 sortie가 없다는 뜻이므로 새로 만듦
                            my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
                        }
                        else {
                            my_sortie_name = uril[0].split('/')[4];
                        }
                    });
                }
            });
        }
        else if (_my_sortie_name === 'unknown-disarm') { // 시작될 때 드론이 시동이 꺼진 상태
            // disarm sortie 적용
            my_sortie_name = 'disarm';
        }
        else if (_my_sortie_name === 'disarm-arm') { // 드론이 꺼진 상태에서 시동이 걸리는 상태
            // 새로운 sortie 만들어 생성하고 설정
            my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
        }
        else if (_my_sortie_name === 'arm-disarm') { // 드론이 시동 걸린 상태에서 시동이 꺼지는 상태
            // disarm sortie 적용
            my_sortie_name = 'disarm';
        }
    }
}

function mon_local_db(data_topic) {
    lte_data.findOne({}).then(function (u) {
        if (u !== undefined) {
            delete u['_id'];
            sh_man.crtci(data_topic + '?rcn=0', 0, u, null, function (rsc, res_body, parent, socket) {
                if (rsc === '2001') {
                    lte_data.remove(u);
                }
            });
        }
    });
}
