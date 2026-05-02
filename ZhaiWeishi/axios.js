import axios from 'axios';
import CryptoJS from 'crypto-js';
import { Base64 } from 'js-base64';

// Polyfill browser globals in Node
try {
  if (typeof global !== 'undefined') {
    if (typeof global.atob === 'undefined') global.atob = Base64.atob;
    if (typeof global.btoa === 'undefined') global.btoa = Base64.btoa;
    if (typeof global.window === 'undefined') global.window = global;
    if (typeof global.navigator === 'undefined') global.navigator = { userAgent: 'node' };
  }
} catch {}

axios.defaults.timeout = 300000;

//http request 拦截器
axios.interceptors.request.use(
	config => {
		// Only stringify for non-GET requests
		if ((config.method || 'get').toLowerCase() !== 'get') {
			config.data = JSON.stringify(config.data);
		}
		// Preserve incoming headers and set defaults if missing
		const incomingHeaders = config.headers || {};
		const merged = { ...incomingHeaders };
		if (!merged['X-Requested-With']) {
			merged['X-Requested-With'] = 'XMLHttpRequest';
		}
		if (!merged['Content-Type']) {
			merged['Content-Type'] = 'application/json; charset=UTF-8';
		}
		// Attach token from process.env if available
		try {
			if (typeof process !== 'undefined' && process.env && process.env.TOKEN && !merged.Token && !merged.token) {
				merged.Token = process.env.TOKEN;
			}
		} catch {}
		config.headers = merged;
		return config;
	},
	error => {
		return Promise.reject(error);
	}
);

//响应拦截器即异常处理
axios.interceptors.response.use(response => {
	if( response.data.code === 1000) {
		console.error('登录超时,请重新登录!');
		setTimeout(() => {
			localStorage.clear();
			sessionStorage.clear();
			location.href = '/Login';
			// router.push({
			// 	path: '/Login',
			// })
			webrtcSDK.destory();
		}, 1000);
	}
	response => {
		if (response.status === 200) {
			return Promise.resolve(response);
		} else {
			return Promise.reject(response);
		}
	}
	return response
}, err => {
	if (err && err.response) {
	  switch (err.response.status) {
		case 400:
			console.error('错误请求!');
			break;
		case 401:
			console.error('未授权，请重新登录!');
			break;
		case 403:
			console.error('拒绝访问');
			break;
		case 404:
			console.error('请求错误,未找到该资源');
			break;
		case 405:
			console.error('请求方法未允许');
			break;
		case 408:
			console.error('请求超时');
			break;
		case 500:
			console.error('服务器端出错');
			break;
		case 501:
			console.error('网络未实现');
			break;
		case 502:
			console.error('网络错误');
			break;
		case 503:
			console.error('服务不可用');
			break;
		case 504:
			console.error('网络超时');
			break;
		case 505:
			console.error('http版本不支持该请求');
			break;
		default:
			console.log(`连接错误${err.response.status}`);
	  }
	} else {
		console.error('连接服务器失败!');
	}
	return Promise.reject(err.response)
})


/**
 * 封装get方法
 * @param url
 * @param data
 * @returns {Promise}
 */

export function get(url,params={}){
	return new Promise((resolve,reject) => {
		axios.get(url,{
			params: params
		})
		.then(response => {
			if(response.data == ''){
				location.href = '/Login';
				// router.push({
				// 	path: '/Login',
				// })
				//webrtcSDK.destory();
			}else{
				var memberInfo = {};
				memberInfo.crypt_iv = 'u5FPyjTMDvmt8kgj4rhPqA==';
				memberInfo.crypt_right = 1;
				memberInfo.crypt_key = 'DBE6912ABD21F187169B7669078B9D90';
				if(memberInfo.crypt_right == 1 && (response.data.code == 1) && response.data.data){
                    const payload = response.data.data;
                    if (typeof payload !== 'string' || payload.length === 0) {
                        // Skip decryption if payload is not a Base64 string
                        resolve(response);
                        return;
                    }
					const crypt_key = 'MC.1888@#!1' + memberInfo.crypt_key;
					try {
						// 将密钥转换为WordArray
						const keyHash = CryptoJS.SHA256(crypt_key);
						const parsedKey = CryptoJS.lib.WordArray.create(keyHash.words);
						
						// 解析IV和加密数据
						const parsedIv = CryptoJS.enc.Base64.parse(memberInfo.crypt_iv);
						const parsedEncryptedData = CryptoJS.enc.Base64.parse(payload);
						
						// 解密
						const decrypted = CryptoJS.AES.decrypt(
							{ ciphertext: parsedEncryptedData },
							parsedKey,
							{ 
								iv: parsedIv,
								mode: CryptoJS.mode.CBC,
								padding: CryptoJS.pad.Pkcs7
							}
						);
						const decodeBuffer = Base64.decode(decrypted.toString(CryptoJS.enc.Utf8));
						response.data.data = decodeBuffer;
                        if (typeof decodeBuffer === 'string') {
                            try {
                                var strJson = JSON.parse(decodeBuffer);
                                if (typeof strJson === 'object' && strJson !== null){
                                    response.data.data = strJson;
                                }
                            } catch (e) {

                            }
                        }
						// console.log(response)
						resolve(response);
					} catch (error) {
						return '解密失败: ' + error.message;
					}
				}else{
					resolve(response);
				}
			}
		})
		.catch(function(reason) {
			reject(reason)
		})
	})
}


/**
 * 封装post请求
 * @param url
 * @param data
 * @returns {Promise}
 */

export function post(url,data,config){
	return new Promise((resolve,reject) => {    
		axios.post(url,data,config)
		.then(response => {
			var memberInfo = {};
			memberInfo.crypt_iv = 'u5FPyjTMDvmt8kgj4rhPqA==';
			memberInfo.crypt_right = 1;
			memberInfo.crypt_key = 'DBE6912ABD21F187169B7669078B9D90';
			if(memberInfo.crypt_right == 1 && (response.data.code == 1) && response.data.data){
                const payload = response.data.data;
                if (typeof payload !== 'string' || payload.length === 0) {
                    // Skip decryption if payload is not a Base64 string
                    resolve(response);
                    return;
                }
				// 解密
				const crypt_key = 'MC.1888@#!1' + memberInfo.crypt_key;
				try {
					// 将密钥转换为WordArray
					const keyHash = CryptoJS.SHA256(crypt_key);
					const parsedKey = CryptoJS.lib.WordArray.create(keyHash.words);
					
					// 解析IV和加密数据
					const parsedIv = CryptoJS.enc.Base64.parse(memberInfo.crypt_iv);
					const parsedEncryptedData = CryptoJS.enc.Base64.parse(payload);
					
					// 解密
					const decrypted = CryptoJS.AES.decrypt(
						{ ciphertext: parsedEncryptedData },
						parsedKey,
						{ 
							iv: parsedIv,
							mode: CryptoJS.mode.CBC,
							padding: CryptoJS.pad.Pkcs7
						}
					);
					const decodeBuffer = Base64.decode(decrypted.toString(CryptoJS.enc.Utf8));
					response.data.data = decodeBuffer;
					if (typeof decodeBuffer === 'string') {
						try {
							var strJson = JSON.parse(decodeBuffer);
							if (typeof strJson === 'object' && strJson !== null){
								response.data.data = strJson;
							}
						} catch (e) {

						}
					}
					// console.log(response)
					resolve(response);
				} catch (error) {
					return '解密失败: ' + error.message;
				}
			}else{
				// 不解密
				resolve(response);
			}
			
		},err => {
			reject(err)
		}).catch(err => {
			reject(err.data)
		})
	})
}

 /**
 * 封装patch请求
 * @param url
 * @param data
 * @returns {Promise}
 */

export function patch(url,data = {}){
	return new Promise((resolve,reject) => {
		axios.patch(url,data)
		.then(response => {
			resolve(response.data);
		},err => {
			reject(err)
		})
	})
}

 /**
 * 封装put请求
 * @param url
 * @param data
 * @returns {Promise}
 */

export function put(url,data = {}){
	return new Promise((resolve,reject) => {
		axios.put(url,data)
			.then(response => {
			resolve(response.data);
		},err => {
			reject(err)
		})
	})
}