// 景点数据
const attractions = [
    {
        id: 'westLake',
        name: '杭州西湖风景名胜区',
        location: '120.1490,30.2591',
        address: '杭州市西湖区龙井路1号',
        openingHours: '周一至周日 00:00-24:00',
        ticketPrice: '免费（部分景点收费）',
        rating: '4.9',
        imageUrl: 'https://picsum.photos/id/1036/800/600'
    },
    {
        id: 'lingyinTemple',
        name: '灵隐寺',
        location: '120.1215,30.2588',
        address: '杭州市西湖区灵隐路法云弄1号',
        openingHours: '周一至周日 06:30-18:00（最晚进入17:30）',
        ticketPrice: '75.00元',
        rating: '4.9',
        imageUrl: 'https://picsum.photos/id/1043/800/600'
    },
    {
        id: 'xixiWetland',
        name: '西溪国家湿地公园',
        location: '120.0832,30.2545',
        address: '杭州市西湖区天目山路518号',
        openingHours: '夏令时: 7:30-18:30, 冬令时: 8:00-17:30',
        ticketPrice: '80.00元',
        rating: '4.7',
        imageUrl: 'https://picsum.photos/id/1056/800/600'
    }
];

// 每日详细行程数据
const dailyItineraries = [
    {
        day: 1,
        title: '西湖一日游',
        items: [
            {
                time: '08:00-08:30',
                activity: '酒店早餐',
                location: '杭州西湖国宾馆',
                notes: '享受酒店自助早餐，为一天行程补充能量'
            },
            {
                time: '09:00-11:30',
                activity: '西湖漫步',
                location: '断桥残雪 → 白堤 → 平湖秋月',
                notes: '建议步行或骑行，欣赏西湖美景，春季桃花盛开尤为美丽'
            },
            {
                time: '12:00-13:30',
                activity: '午餐',
                location: '楼外楼',
                notes: '品尝杭州名菜：西湖醋鱼、东坡肉、宋嫂鱼羹'
            },
            {
                time: '14:00-17:00',
                activity: '西湖游船 + 苏堤春晓',
                location: '西湖游船码头 → 三潭印月 → 苏堤',
                notes: '游船票含三潭印月门票，苏堤建议步行游览'
            },
            {
                time: '18:00-19:30',
                activity: '晚餐',
                location: '知味观·味庄',
                notes: '杭帮菜名店，推荐西湖藕粉、猫耳朵'
            },
            {
                time: '20:00-21:00',
                activity: '西湖夜景',
                location: '湖滨音乐喷泉',
                notes: '音乐喷泉表演时间：19:00、20:00各一场'
            }
        ]
    },
    {
        day: 2,
        title: '灵隐寺文化游',
        items: [
            {
                time: '07:30-08:00',
                activity: '民宿早餐',
                location: '杭州灵隐寺旁民宿',
                notes: '品尝当地特色早餐'
            },
            {
                time: '08:30-11:30',
                activity: '灵隐寺游览',
                location: '灵隐寺 → 飞来峰',
                notes: '建议早到避开人流，飞来峰石窟值得一看'
            },
            {
                time: '12:00-13:30',
                activity: '午餐',
                location: '知竹素斋',
                notes: '灵隐寺附近知名素菜馆，推荐素面、素鹅'
            },
            {
                time: '14:00-16:00',
                activity: '龙井村品茶',
                location: '龙井村',
                notes: '参观茶园，可以体验采茶和品茶'
            },
            {
                time: '16:30-18:30',
                activity: '清河坊街',
                location: '清河坊历史文化街区',
                notes: '感受南宋御街风情，购买特色纪念品'
            },
            {
                time: '19:00-20:30',
                activity: '晚餐',
                location: '皇饭儿(高银街店)',
                notes: '杭帮菜名店，推荐乾隆鱼头、叫花鸡'
            }
        ]
    },
    {
        day: 3,
        title: '西溪湿地生态游',
        items: [
            {
                time: '08:00-08:30',
                activity: '酒店早餐',
                location: '杭州西溪宾馆',
                notes: '享受酒店早餐后办理退房'
            },
            {
                time: '09:00-12:00',
                activity: '西溪湿地游览',
                location: '周家村入口 → 烟水渔庄 → 深潭口',
                notes: '建议乘船游览，体验"一曲溪流一曲烟"美景'
            },
            {
                time: '12:00-13:30',
                activity: '午餐',
                location: '西溪天堂商业街',
                notes: '多家餐厅可选，推荐尝试西溪杂鱼锅'
            },
            {
                time: '14:00-16:00',
                activity: '湿地徒步',
                location: '河渚街 → 福堤',
                notes: '漫步福堤，欣赏湿地生态风光'
            },
            {
                time: '16:30',
                activity: '行程结束',
                location: '西溪湿地出口',
                notes: '根据返程交通安排离开'
            }
        ]
    }
];

// 交通路线数据
const routes = [
    {
        origin: 'westLake',
        destination: 'lingyinTemple',
        name: '西湖到灵隐寺',
        path: [[120.1490,30.2591], [120.1400,30.2589], [120.1300,30.2588], [120.1215,30.2588]]
    },
    {
        origin: 'lingyinTemple',
        destination: 'xixiWetland',
        name: '灵隐寺到西溪湿地',
        path: [[120.1215,30.2588], [120.1100,30.2570], [120.1000,30.2550], [120.0832,30.2545]]
    }
];

// 初始化地图
function initMap() {
    // 注意：这里需要替换为您自己的高德地图API密钥
    const map = new AMap.Map('map-container', {
        zoom: 12,
        center: [120.1490, 30.2591], // 西湖坐标
        viewMode: '3D'
    });

    // 解决Canvas2D性能警告 - 等待地图加载完成
    map.on('complete', function() {
        setTimeout(() => {
            const canvas = document.querySelector('#map-container canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx && !ctx.willReadFrequently) {
                    // 设置willReadFrequently属性以优化性能
                    Object.defineProperty(ctx, 'willReadFrequently', { value: true });
                }
            }
        }, 100);
    });

    // 添加地图控件
    AMap.plugin(['AMap.ToolBar', 'AMap.Scale'], function() {
        map.addControl(new AMap.ToolBar());
        map.addControl(new AMap.Scale());
    });

    // 添加景点标记
    attractions.forEach(attraction => {
        // 解析并验证坐标
const coords = attraction.location.split(',').map(coord => parseFloat(coord.trim()));
const lng = isNaN(coords[0]) ? 120.1490 : coords[0];
const lat = isNaN(coords[1]) ? 30.2591 : coords[1];
        const marker = new AMap.Marker({
            position: [lng, lat],
            title: attraction.name,
            icon: new AMap.Icon({
                size: new AMap.Size(36, 36),
                image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
                imageSize: new AMap.Size(36, 36)
            })
        });

        // 信息窗口
        const infoWindow = new AMap.InfoWindow({
            content: `
                <div style="padding: 10px;">
                    <h3 style="margin:0 0 5px 0;">${attraction.name}</h3>
                    <p>地址: ${attraction.address}</p>
                    <p>开放时间: ${attraction.openingHours}</p>
                    <p>门票: ${attraction.ticketPrice}</p>
                    <p>评分: ${attraction.rating}</p>
                </div>`,
            size: new AMap.Size(300, 0)
        });

        marker.on('click', function() {
            infoWindow.open(map, marker.getPosition());
        });

        map.add(marker);
    });

    // 绘制路线
    routes.forEach(route => {
        const polyline = new AMap.Polyline({
            path: route.path,
            strokeColor: '#165DFF',
            strokeWeight: 5,
            strokeOpacity: 0.7,
            strokeStyle: 'solid',
            lineJoin: 'round'
        });

        map.add(polyline);
    });
}

// 生成详细行程
function renderDetailedItinerary() {
    const container = document.getElementById('detailed-itinerary');
    container.innerHTML = '';

    dailyItineraries.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'bg-white rounded-lg p-6 card-shadow mb-8';

        dayElement.innerHTML = `
            <div class="flex items-center mb-6">
                <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold mr-4">${day.day}</div>
                <h3 class="text-xl font-semibold">${day.title}</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr>
                            <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                            <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">地点</th>
                            <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">活动</th>
                            <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${day.items.map(item => `
                            <tr>
                                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${item.time}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${item.location}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${item.activity}</td>
                                <td class="px-4 py-3 text-sm text-gray-500">${item.notes}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.appendChild(dayElement);
    });
}

// 渲染景点图片画廊
function renderAttractionsGallery() {
    const container = document.getElementById('attractions-gallery');
    container.innerHTML = '';

    attractions.forEach(attraction => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg overflow-hidden card-shadow transition-transform duration-300 hover:transform hover:scale-105';

        card.innerHTML = `
            <div class="relative h-48 overflow-hidden">
                <img src="${attraction.imageUrl}" alt="${attraction.name}" class="w-full h-full object-cover">
            </div>
            <div class="p-4">
                <h3 class="text-lg font-semibold mb-2">${attraction.name}</h3>
                <div class="flex items-center text-sm text-gray-500 mb-2">
                    <i class="fa fa-map-marker mr-1"></i> ${attraction.address}
                </div>
                <div class="flex items-center text-sm text-yellow-500 mb-2">
                    <i class="fa fa-star mr-1"></i> ${attraction.rating}分
                </div>
                <div class="text-sm text-gray-600">
                    <p><i class="fa fa-clock-o mr-1 text-primary"></i> ${attraction.openingHours}</p>
                    <p><i class="fa fa-ticket mr-1 text-primary"></i> ${attraction.ticketPrice}</p>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// 页面加载完成后初始化
window.onload = function() {
    // 初始化地图
    if (typeof AMap !== 'undefined') {
        initMap();
    } else {
        document.getElementById('map-container').innerHTML = '<div class="flex flex-col items-center justify-center h-full text-red-500 p-4"><p class="font-bold mb-2">地图加载失败</p><p>请替换为您自己的高德地图API密钥</p><p class="text-sm mt-2">获取密钥: <a href="https://lbs.amap.com/dev/key/app" target="_blank" class="text-blue-500 underline">https://lbs.amap.com/dev/key/app</a></p></div>';
    }

    // 渲染详细行程
    renderDetailedItinerary();

    // 渲染景点图片画廊
    renderAttractionsGallery();
};

// 添加打印功能
function printItinerary() {
    window.print();
}

// 添加到window对象，供HTML调用
window.printItinerary = printItinerary;

// 添加天气信息更新
function updateWeatherInfo() {
    const weatherElement = document.getElementById('weather-info');
    if (weatherElement) {
        weatherElement.textContent = '晴转多云，18-28°C';
    }
}

// 页面加载时更新天气信息
updateWeatherInfo();