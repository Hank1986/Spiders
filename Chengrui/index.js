import axios from 'axios';
import xlsx from 'xlsx';
import { setTimeout } from 'timers/promises';
import CryptoJS from 'crypto-js';
import { Base64 } from 'js-base64';

// Determine company from CLI arg or env and set BASE_URL
const args = process.argv.slice(2);
const companyArg = args.find(a => a.startsWith('--company='));
const COMPANY = (companyArg ? companyArg.split('=')[1] : process.env.COMPANY || 'chengrui').toLowerCase();
const BASE_URL = COMPANY === 'xinge'
  ? 'https://server.xingeguanli.com/osapi'
  : COMPANY === 'chengyu'
  ? 'https://server.chengyuzhirui.com/osapi'
  : 'https://server.chengruizichan.com/osapi';

const CASES_PER_PAGE = 100;
const LOGIN_CREDENTIALS = COMPANY === 'chengyu'
    ? { username: 'ahbozhen', password: 'Aa123456@' }
    : { username: 'hfbozhen', password: 'Aa123456' };
var memberInfo = {};

let TOKEN = null;

//http request 拦截器
axios.interceptors.request.use(
	config => {
		config.data = JSON.stringify(config.data);
		config.headers = {
			'X-Requested-With': 'XMLHttpRequest',
			'Content-Type': 'application/json; charset=UTF-8',
            'Token': TOKEN
		}
		return config;
	},
	error => {
		return Promise.reject(error);
	}
);

//响应拦截器即异常处理
axios.interceptors.response.use(response => {
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

async function get(url,params={}){
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
				if(memberInfo.crypt_right == 1 && (response.data.code == 1) && response.data.data){
					const crypt_key = (COMPANY === 'chengyu' ? 'MC.CHyZr.1888@#!1' : 'MC.1888@#!1') + memberInfo.crypt_key;
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

async function login() {
    try {
        const response = await axios.post(`${BASE_URL}/Login/Loginact`, LOGIN_CREDENTIALS);
        
        if (response.data.code === 1) {
            TOKEN = response.data.data.token;
            memberInfo = response.data.data.memberInfo;
            memberInfo.token = TOKEN;
            console.log(`Login successful for company: ${COMPANY}, token obtained`);
            // Persist token for local axios interceptor
            //localStorage.setItem('token', JSON.stringify(TOKEN));
            //return TOKEN;
        }
    } catch (error) {
        console.error('Error during login:', error.message);
        throw error;
    }
}



async function getCaseList(page) {
    try {
        const response = await get(`${BASE_URL}/Cases/index`, {
                page,
                perPage: CASES_PER_PAGE,
                sortstatus: '',
                sorttype: '',
                status: 0,
                snatch_id: '',
                is_settle: ''
            }
        );
        return response.data.data;
    } catch (error) {
        console.error(`Error fetching case list page ${page}:`, error.message);
        throw error;
    }
}

async function getCaseDetails(caseId) {
    try {
        const response = await get(`${BASE_URL}/Cases/caseInfo`, {
                case_id: caseId
            });
        return response.data.data.data;
    } catch (error) {
        console.error(`Error fetching case details for ID ${caseId}:`, error.message);
        throw error;
    }
}

function combineData(listData, detailsData) {
    // Combine all fields from both list and details
    const otherInfo = detailsData.other_info || {};
    
    return {
        // Basic Information
        '案件ID': detailsData.id,
        '主体会员': detailsData.mem_primary,
        '账单ID': detailsData.bill_id,
        '案件编号': detailsData.bill_no,
        '债务人姓名': detailsData.case_name,
        '身份证号': detailsData.case_idcard,
        '身份证号(脱敏)': detailsData.case_idcard_asterisk,
        '手机号': detailsData.case_phone,
        
        // Loan Information
        '贷款时间': detailsData.loan_time ? new Date(detailsData.loan_time * 1000).toLocaleDateString() : '',
        '贷款金额': detailsData.loan_money,
        '贷款机构': detailsData.loan_org,
        '逾期天数': detailsData.overdue_days,
        '利息': detailsData.interest,
        '罚息': detailsData.fined,
        '其他费用': detailsData.other_fee,
        '手续费': detailsData.charge,
        '期数': detailsData.period,
        
        // Entrust Information
        '委托开始': detailsData.entrust_start,
        '委托结束': detailsData.entrust_end,
        '委托金额': detailsData.entrust_money,
        '新委托金额': detailsData.new_entrust_money,
        '计算系数': detailsData.calc_coef,
        
        // Personal Information
        '年龄': detailsData.age,
        '性别': detailsData.sex,
        '婚姻状况': detailsData.marry_type,
        'QQ': detailsData.qq,
        '邮箱': detailsData.email,
        '微信': detailsData.weixin,
        '地址': detailsData.address,
        '户籍地址': detailsData.huji_address,
        '家庭住址': detailsData.home_address,
        '公司地址': detailsData.company_address,
        '公司名称': detailsData.company_name,
        '地区': detailsData.case_area,
        '职业': detailsData.occ,
        
        // Contract Information
        '合同编号': detailsData.contract,
        '产品': detailsData.product,
        '产品名称': detailsData.product_name,
        '银行卡': detailsData.bank_card,
        '银行名称': detailsData.bank_name,
        '分期数': detailsData.periods,
        '每期金额': detailsData.per_money,
        '已还期数': detailsData.per_had,
        '未还期数': detailsData.per_not,
        '期数日期': detailsData.per_date,
        
        // Payment Information
        '已还金额': detailsData.loan_had,
        '应还本金': detailsData.loan_capital,
        '逾期金额': detailsData.overdue_money,
        '逾期开始时间': detailsData.overdue_start_time ? new Date(detailsData.overdue_start_time * 1000).toLocaleDateString() : '',
        '应还本金2': detailsData.should_capital,
        '已还本金2': detailsData.already_capital,
        '剩余本金': detailsData.last_capital,
        '滞纳金': detailsData.late_fee,
        '最后还款金额': detailsData.last_repay_money,
        '最后还款时间': detailsData.last_repay_time ? new Date(detailsData.last_repay_time * 1000).toLocaleDateString() : '',
        '逾期利息': detailsData.overdue_interest,
        
        // Status Information
        '状态': detailsData.status,
        '状态类型': detailsData.status_type,
        '案件状态': detailsData.case_status,
        '催收状态': detailsData.coll_status,
        '委托ID': detailsData.entrust_id,
        '会员ID': detailsData.member_id,
        '会员名称': detailsData.member_name,
        '跟进时间': detailsData.follow_time,
        '添加时间': detailsData.add_time,
        '备注时间': detailsData.note_time,
        
        // Additional Information
        '来源': detailsData.source,
        '父级会员': detailsData.p_mem_primary,
        '父级账单号': detailsData.p_bill_no,
        '父级账单ID': detailsData.p_bill_id,
        '父级备注': detailsData.p_is_notes,
        '父级IC备注': detailsData.p_is_ic_notes,
        '是否备注': detailsData.is_notes,
        '剩余时间': detailsData.remain_time,
        '是否抢单': detailsData.is_snatch,
        '抢单佣金': detailsData.snatch_commission,
        '抢单委托天数': detailsData.snatch_entrust_day,
        '抢单状态': detailsData.snatch_status,
        '备注': detailsData.remark,
        '执行状态': detailsData.exec_status,
        '电话清洗': detailsData.phone_clean,
        '区域': detailsData.area,
        '诉讼': detailsData.lawsuit,
        '勉强': detailsData.reluctant,
        '标记A': detailsData.mark_a,
        '标记B': detailsData.mark_b,
        '标记C': detailsData.mark_c,
        '债权方来源': detailsData.creditor_from,
        '债权方': detailsData.creditor,
        '学历': detailsData.degree,
        '是否结清': detailsData.is_settle,
        '是否删除': detailsData.is_deleted,
        '删除时间': detailsData.delete_time,
        '删除人': detailsData.delete_by,
        '更新日期': detailsData.update_date,
        '风险标签': detailsData.risk_tag,
        '是否外包': detailsData.is_outsourcing,
        '案件用户询问': detailsData.case_user_ask,
        '是否失信': detailsData.is_shixin,
        '标签可怜': detailsData.tag_kelian,
        '标签案件': detailsData.tag_case,
        '是否规划': detailsData.is_planning,
        '债权方是否出售': detailsData.creditor_sold,
        '外部ID': detailsData.foreign_id,
        '是否车辆处置': detailsData.is_car_dispose,
        '询问1': detailsData.ask_1,
        '询问2': detailsData.ask_2,
        '询问3': detailsData.ask_3,
        '代扣': detailsData.withhold,
        '验证状态': detailsData.verify_status,
        '代扣状态': detailsData.withhold_status,
        '代扣次数': detailsData.withhold_times,
        '未跟进天数': detailsData.unfollow_days,
        '案件折扣状态': detailsData.caseagios_status,
        '案件联系人ID': detailsData.case_contacts_id,
        '总还款金额': detailsData.total_repay_money,
        '折扣金额': detailsData.agio_money,
        '应付金额': detailsData.amount_payable,
        '剩余应付金额': detailsData.surplus_amount_payable,
        '借据PDF': detailsData.jqzm_pdf,
        '联合数量': detailsData.joint_num,
        '联合案件数量': detailsData.zc_case_joint_count,
        '还款通知标志': detailsData.repay_notice_flag,
        
        // Other Info from API
        '资金模式': otherInfo['资金模式'],
        '资金方': otherInfo['资金方'],
        '放款卡银行': otherInfo['放款卡银行'],
        '放款银行卡号': otherInfo['放款银行卡号'],
        '签约方式': otherInfo['签约方式'],
        '学历详情': otherInfo['学历'],
        '借款到期日期': otherInfo['借款到期日期'],
        '应还本金_详情': otherInfo['应还本金'],
        '应还利息_详情': otherInfo['应还利息'],
        '应还费用_详情': otherInfo['应还费用'],
        '应还罚息_详情': otherInfo['应还罚息'],
        '应还滞纳金': otherInfo['应还滞纳金'],
        '应还其它': otherInfo['应还其它'],
        '应还服务费滞纳金': otherInfo['应还服务费滞纳金'],
        '已还本金_详情': otherInfo['已还本金'],
        '已还利息_详情': otherInfo['已还利息'],
        '已还费用_详情': otherInfo['已还费用'],
        '已还罚息_详情': otherInfo['已还罚息'],
        '已还滞纳金': otherInfo['已还滞纳金'],
        '已还其它': otherInfo['已还其它'],
        '已还服务费滞纳金': otherInfo['已还服务费滞纳金'],
        '剩余利息': otherInfo['剩余利息'],
        '剩余其他费用': otherInfo['剩余其他费用'],
        '剩余分期费用': otherInfo['剩余分期费用'],
        '剩余逾期费用': otherInfo['剩余逾期费用'],
        '合同剩余本金': otherInfo['合同剩余本金'],
        '债权转让时间': otherInfo['债权转让时间']
    };
}

async function processAllCases() {
    try {
        // Login first to get token
        console.log('Logging in...');
        await login();
        
        // Get first page to determine total count
        const firstPage = await getCaseList(1);
        console.log('getCaseList response:', JSON.stringify(firstPage)?.slice(0, 300));
        const totalPages = Math.ceil(firstPage.count / CASES_PER_PAGE);
        console.log(`Total cases: ${firstPage.count}, Total pages: ${totalPages}`);

        const allCases = [];
        const CONCURRENCY_LIMIT = 5; // Process 5 cases concurrently

        // Process all pages
        for (let page = 1; page <= totalPages; page++) {
            console.log(`Processing batch ${page} of ${totalPages}...`);
            
            try {
                const caseList = await getCaseList(page);
                
                // Process cases in parallel with concurrency limit
                const casePromises = [];
                for (let i = 0; i < caseList.data.length; i += CONCURRENCY_LIMIT) {
                    const batch = caseList.data.slice(i, i + CONCURRENCY_LIMIT);
                    
                    const batchPromises = batch.map(async (caseItem) => {
                        try {
                            const caseDetails = await getCaseDetails(caseItem.id);
                            const combinedData = combineData(caseItem, caseDetails);
                            console.log(`  - Processed case ID: ${caseItem.id}`);
                            return combinedData;
                        } catch (error) {
                            console.error(`  - Failed to process case ID ${caseItem.id}:`, error.message);
                            return null;
                        }
                    });
                    
                    const results = await Promise.all(batchPromises);
                    const validResults = results.filter(result => result !== null);
                    allCases.push(...validResults);
                    
                    // Small delay between batches to avoid overwhelming the server
                    if (i + CONCURRENCY_LIMIT < caseList.data.length) {
                        await setTimeout(200);
                    }
                }
                
                console.log(`  Completed batch ${page}, processed ${caseList.data.length} cases`);
            } catch (error) {
                console.error(`Failed to process page ${page}:`, error.message);
            }
        }

        // Create Excel file
        const worksheet = xlsx.utils.json_to_sheet(allCases);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Cases');
        
        const fileName = `cases_export_${COMPANY}_${new Date().toISOString().split('T')[0]}.xlsx`;
        xlsx.writeFile(workbook, fileName);
        
        console.log(`\nExport completed! File saved as: ${fileName}`);
        console.log(`Total cases processed: ${allCases.length}`);
        
    } catch (error) {
        console.error('Failed to process cases:', error?.message || error);
    }
}

// Start processing
processAllCases();
