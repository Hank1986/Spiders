import axios from 'axios';
import CryptoJS from 'crypto-js';
import { Base64 } from 'js-base64';

axios.defaults.timeout = 300000;

//http request 拦截器
axios.interceptors.request.use(
	config => {
		config.data = JSON.stringify(config.data);
		config.headers = {
			'X-Requested-With': 'XMLHttpRequest',
			'Content-Type': 'application/json; charset=UTF-8'
		}
		return config;
	},
	error => {
		return Promise.reject(error);
	}
);

//响应拦截器即异常处理
axios.interceptors.response.use(response => {
	if( response.data.code === 1000) {
		setTimeout(() => {
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
			break;
		case 401:
			break;
		case 403:
			break;
		case 404:
			break;
		case 405:
			break;
		case 408:
			break;
		case 500:
			break;
		case 501:
			break;
		case 502:
			break;
		case 503:
			break;
		case 504:
			break;
		case 505:
			break;
		default:
			console.log(`连接错误${err.response.status}`)
	  }
	} else {
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
				webrtcSDK.destory();
			}else{
				var memberInfo = '';

				if(user){
					memberInfo = user.memberInfo;
				}
				memberInfo.crypt_iv = 'u5FPyjTMDvmt8kgj4rhPqA==';
				memberInfo.crypt_right = 1;
				memberInfo.crypt_key = 'DBE6912ABD21F187169B7669078B9D90'
				if(memberInfo.crypt_right == 1 && (response.data.code == 1) && response.data.data){
					const crypt_key = 'MC.1888@#!1' + memberInfo.crypt_key;
					try {
						// 将密钥转换为WordArray
						const keyHash = CryptoJS.SHA256(crypt_key);
						const parsedKey = CryptoJS.lib.WordArray.create(keyHash.words);
						
						// 解析IV和加密数据
						const parsedIv = CryptoJS.enc.Base64.parse(memberInfo.crypt_iv);
						const parsedEncryptedData = CryptoJS.enc.Base64.parse(response.data.data);
						
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
			var memberInfo = '';
			if(user){
				memberInfo = user.memberInfo;
			}
			memberInfo.crypt_iv = 'u5FPyjTMDvmt8kgj4rhPqA==';
			memberInfo.crypt_right = 1;
			memberInfo.crypt_key = 'DBE6912ABD21F187169B7669078B9D90'
			if(memberInfo.crypt_right == 1 && (response.data.code == 1) && response.data.data){
				// 解密
				const crypt_key = 'MC.1888@#!1' + memberInfo.crypt_key;
				try {
					// 将密钥转换为WordArray
					const keyHash = CryptoJS.SHA256(crypt_key);
					const parsedKey = CryptoJS.lib.WordArray.create(keyHash.words);
					
					// 解析IV和加密数据
					const parsedIv = CryptoJS.enc.Base64.parse(memberInfo.crypt_iv);
					const parsedEncryptedData = CryptoJS.enc.Base64.parse(response.data.data);
					
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

// Export the configured axios instance as default for consumers using default import
export default axios;


// WEBPACK FOOTER //
// ./src/api/axios.js