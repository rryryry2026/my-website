---
title: "写给新手的 Java 时间处理指南：从「时间戳是什么」到企业项目实战"
description: "写真实项目代码，绕不开的永远是时间。这篇带着新手把项目里高频出现的时间代码按用途归了个类，顺带记下可能踩的坑。"
pubDate: "2026-11-09"
updatedDate: "2026-11-09"
category: "技术文章"
tags:
  - "后端"
draft: false
---

## 一、先搞懂三个词：时间戳、UTC、时区

不搞懂这三个词，后面所有代码都是背下来的，换个场景就不会用。

### 1.1 时间戳（Timestamp / Epoch 时间）

计算机不看日历，它只看**一个数字**：从 1970 年 1 月 1 日 0 点 0 分 0 秒（UTC）到现在，一共过了多少**毫秒**。

```java
long ts = System.currentTimeMillis();
System.out.println(ts);   // 例如 1794216000000
```

这个数字叫**时间戳**，也叫 Unix 时间戳、epoch 时间。

**生活类比**：想象 1970 年 1 月 1 日有人按下了一个秒表，从此秒表一直在走。时间戳就是"秒表上现在显示的数字"。它跟你在哪个国家、钟表上写几点完全无关。

为什么所有系统都用这个数字？

- **它是一个纯数字**，存数据库、传网络、比大小都非常方便。
- **它没有歧义**。中国和美国看到的同一个时间戳，指向的是**同一个物理时刻**。

> 小知识：为什么是 1970 年？因为 Unix 操作系统当年随手定的起点，后来大家都跟着用了，没有特别深的道理。

### 1.2 UTC：全球统一的"标准钟"

地球是圆的，太阳不能同时照到所有地方。北京中午 12 点时，纽约是半夜。如果大家都说"现在是 12 点"，就乱套了。

所以国际上定了一个统一基准时间，叫 **UTC（协调世界时）**。

**生活类比**：把 UTC 想象成"全球总部的标准钟"。各地都在总部时间的基础上做加减。

- 中国是 UTC+8：总部 0 点，中国是早上 8 点。
- 日本是 UTC+9。
- 美国纽约是 UTC-5（夏令时是 UTC-4）。

### 1.3 时区：各地在标准钟上的偏移

**时区**就是"你这个地方的钟，比 UTC 快或慢多少"。

代码里长这样：

```java
ZoneId.of("Asia/Shanghai")   // 中国，UTC+8
ZoneId.of("America/New_York") // 纽约，会随季节变化
```

**注意**：我们平时说"北京时间 2026-11-09 10:00:00"，这句话里其实藏了两层信息：

1. 一个具体时刻；
2. 这个时刻是在"北京时区"下的表示。

如果只写 `2026-11-09 10:00:00`，不说是哪个时区，那它就是**含糊的**。中国人理解成 UTC+8 的 10 点，美国人可能理解成 UTC-5 的 10 点，两者差了 13 个小时。

**这是企业里时间 bug 的头号来源。**

### 1.4 用一个例子把三个词串起来

假设现在是北京时间 2026 年 11 月 9 日上午 10 点：

| 表达方式 | 值 |
|---|---|
| 时间戳（毫秒） | `1794216000000` |
| UTC 时间 | `2026-11-09 02:00:00` |
| 北京时间 | `2026-11-09 10:00:00` |

这三个说的是**同一个时刻**，只是写法不同。

- 时间戳最不容易错，因为它不涉及"几点"。
- UTC 和北京时间只是"同一个东西的两种显示"。
- 换算关系：北京时间 = UTC + 8 小时。

---

## 二、分清四种"时间"，选类型才不会错

新手最容易犯的错，是把四种完全不同的东西混为一谈。先分清它们：

| 你要表达什么 | 例子 | 用哪个类 |
|---|---|---|
| **时刻**：时间轴上某一个点 | "订单在 2026-11-09 10:00:00 创建" | `Instant` |
| **本地时间**：某个地方的墙上时间 | "营业日是 2026-11-09" | `LocalDateTime` / `LocalDate` |
| **时长**：两件事之间隔了多久 | "这个查询花了 350 毫秒" | `Duration` |
| **带时区的时刻** | "纽约时间 2026-11-09 10:00" | `ZonedDateTime` |

**生活类比：**

- **时刻（Instant）** = 历史书上的"1949 年 10 月 1 日"，全球公认的一个点。
- **本地时间（LocalDateTime）** = 你家里墙上挂的钟和日历，只写"11 月 9 日 10 点"，不写是哪个城市。
- **时长（Duration）** = 厨房里煮鸡蛋的计时器，它只知道"过了 5 分钟"，不知道现在是几点。
- **带时区的时刻（ZonedDateTime）** = "纽约时间 11 月 9 日 10 点"，既说了钟表数字，也说了是哪个城市。

这个区分不是学究气。**选错类型，代码在开发机上跑得好好的，上线到 UTC 服务器就会差 8 小时。**

---

## 三、java.time 的六个核心类

Java 8 引入了 `java.time` 包，下面这六个覆盖了 95% 的场景。每个我都会讲：**它是什么、什么时候用、代码怎么写、有什么坑**。

### 3.1 Instant：时间轴上的一个点

**它是什么**：表示 UTC 时间轴上的一个精确时刻。内部就是个秒数 + 纳秒数，本质上就是时间戳。

**什么时候用**：记录"事情发生的瞬间"，或者跨系统传输时间。

```java
Instant now = Instant.now();
System.out.println(now);          // 2026-11-09T02:00:00.123Z
System.out.println(now.toEpochMilli());  // 1794216000123

// 从时间戳还原
Instant fromTs = Instant.ofEpochMilli(1794216000000L);
```

看到末尾的 `Z` 了吗？它表示 UTC（Zero offset）。`Instant` 打印出来永远带 `Z`，因为它没有时区概念，就是全球统一时间。

**坑**：`Instant` 直接打印给人看不好读，需要格式化，或者先转成带时区的类型再展示。

### 3.2 LocalDateTime：不带时区的"墙上时间"

**它是什么**：年、月、日、时、分、秒、纳秒的组合，**但不包含任何时区信息**。

**什么时候用**：业务里的"营业日""报表日期""用户填写的预约时间"这种本地时间概念。

```java
LocalDateTime now = LocalDateTime.now();
System.out.println(now);   // 2026-11-09T10:00:00

LocalDateTime specific = LocalDateTime.of(2026, 11, 9, 10, 0, 0);
System.out.println(specific);  // 2026-11-09T10:00
```

**类比**：这就是你家墙上那张日历 + 挂钟，它只告诉你"11 月 9 日 10 点"，但**不知道你在哪个城市**。

**最大的坑**：`LocalDateTime.now()` 取的是**服务器默认时区**的时间。生产服务器大多数是 UTC，所以你在国内开发机上写 `LocalDateTime.now()` 看到的是北京时间，部署到 UTC 容器里就会差 8 小时。**永远不要用它记录"事情发生的瞬间"，它只适合记录"业务本地时间"。**

### 3.3 LocalDate：只有日期，没有时间

**它是什么**：只有年、月、日，没有时、分、秒。

**什么时候用**：生日、账期、统计的"某一天"。

```java
LocalDate today = LocalDate.now();
LocalDate date = LocalDate.of(2026, 11, 9);

System.out.println(today.getYear());      // 2026
System.out.println(today.getMonthValue()); // 11
System.out.println(today.getDayOfMonth()); // 9
```

**类比**：撕下来的日历纸，只有"11 月 9 日"这一页，没有具体几点。

### 3.4 ZonedDateTime：带时区的时刻

**它是什么**：`LocalDateTime` + 一个 `ZoneId`（时区）。它既知道钟表数字，也知道这是哪个城市的时间。

**什么时候用**：需要明确时区的场景，比如跨时区业务、给用户展示时间。

```java
ZonedDateTime shanghaiNow = ZonedDateTime.now(ZoneId.of("Asia/Shanghai"));
System.out.println(shanghaiNow);   // 2026-11-09T10:00:00+08:00[Asia/Shanghai]

ZonedDateTime newYorkNow = ZonedDateTime.now(ZoneId.of("America/New_York"));
System.out.println(newYorkNow);    // 2026-11-08T21:00:00-05:00[America/New_York]
```

两者说的是**同一个时刻**，只是钟表显示不同。

**类比**：挂钟旁边贴了一张标签"这是纽约的钟"。

**坑**：不要用 `equals` 比较两个 `ZonedDateTime`，时区不同时结果永远是 false，哪怕它们是同一时刻。要比时刻，统一转成 `Instant` 再比：

```java
a.toInstant().equals(b.toInstant());   // 正确
a.equals(b);                            // 错误，时区不同就 false
```

### 3.5 Duration：一段时长

**它是什么**：两个时刻之间的时间差，粒度到纳秒。

**什么时候用**：超时配置、耗时统计。

```java
Duration timeout = Duration.ofSeconds(30);
Duration alsoMinutes = Duration.ofMinutes(1);
long millis = timeout.toMillis();   // 30000
```

**类比**：厨房里的煮蛋计时器，它只关心"过了多久"，不关心"现在几点"。

**为什么不用裸 `long` 存毫秒？** 因为裸数字没有单位，光看 `30` 不知道是 30 毫秒、30 秒还是 30 分钟。`Duration` 把单位写进了代码里：

```java
Duration.ofMillis(30)    // 30 毫秒
Duration.ofSeconds(30)   // 30 秒，差了 1000 倍！
```

**坑**：单位写错是线上事故的常见原因。用 `Duration` 至少能让 review 的人一眼看出来。

### 3.6 DateTimeFormatter：时间与字符串的翻译官

**它是什么**：负责把时间对象格式化成字符串，或者把字符串解析成时间对象。

**什么时候用**：任何需要"给人看"或"从人那里接收"时间的场景。

```java
DateTimeFormatter formatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

// 时间 -> 字符串（格式化）
String text = formatter.format(LocalDateTime.now());
System.out.println(text);   // 2026-11-09 10:00:00

// 字符串 -> 时间（解析）
LocalDateTime parsed = LocalDateTime.parse("2026-11-09 10:00:00", formatter);
```

`ofPattern` 里的字母是占位符：

| 写法 | 含义 | 例子 |
|---|---|---|
| `yyyy` | 年 | 2026 |
| `MM` | 月 | 11 |
| `dd` | 日 | 09 |
| `HH` | 24 小时制的小时 | 13 |
| `mm` | 分钟 | 05 |
| `ss` | 秒 | 30 |
| `SSS` | 毫秒 | 123 |

注意大小写：`MM` 是月，`mm` 是分；`HH` 是 24 小时，`hh` 是 12 小时。写成 `mm` 当月份用，会得到 01-12 这类诡异结果。

**类比**：翻译官。中文时间对象 ↔ 英文字符串。

**最大的优点**：`DateTimeFormatter` 是**不可变的、线程安全的**。你可以把它写成 `static final`，所有请求共用一份，不会出问题。

**对比老 API**：`SimpleDateFormat` 不是线程安全的。多个请求同时用它，会输出错乱的时间。下面单独说。

---

## 四、企业最常见的 6 段代码

概念讲完了，看真正在项目里会写的代码。

### 4.1 缓存过期：判断"这碗饭还能不能吃"

**场景**：接口查数据库很慢。第一次查完，把结果先放进内存（缓存），10 秒内再来查，直接返回内存里的，不查库。

**问题**：10 秒后这份数据就旧了，得重新查。怎么判断过没过期？

**答案**：存的时候除了存数据，再存一个"过期时刻"。

```java
// 缓存里存的东西：数据 + 过期时刻
record CachedItem(String data, long expiresAt) {}

// 存数据时（比如查完接口后）
long ttlMs = 10_000;   // 有效期 10 秒
long expiresAt = System.currentTimeMillis() + ttlMs;
cache.put("key", new CachedItem("查询结果", expiresAt));

// 取数据时
CachedItem item = cache.get("key");
if (item != null && item.expiresAt() > System.currentTimeMillis()) {
    return item.data();   // 还没过期，直接用
}
// 过期了，重新查
```

**逐行解释：**

- `record CachedItem(...)`：Java 16 的记录类，一句话定义一个只装数据的类，自动生成构造器和 `data()` / `expiresAt()` 方法。
- `record` 里两个字段：真正要用的数据，和"什么时候过期"。
- `System.currentTimeMillis() + ttlMs`：现在的时间戳 + 10 秒，就是 10 秒后的时刻。
- `item.expiresAt() > System.currentTimeMillis()`：过期时刻 > 现在，说明还没到点，有效。

**为什么不存"创建时刻 + 每次算过了多久"？**

因为判断时只需要一次比较，不用做减法。缓存可能每秒被读几万次，省一点是一点。

**企业里还会做两件事：**

1. **惰性删除**：读到过期数据时顺手删掉（`cache.remove`），省内存。
2. **定时清理**：起一个后台任务，定期扫一遍删过期数据。因为有些 key 存进去后再没人读，惰性删除永远轮不到它们。

### 4.2 Token 提前刷新：路上也要花时间

**场景**：登录后服务器发一个 token（通行证），比如 2 小时有效。每次请求带上它，服务器验一下就知道你是谁。

**问题**：token 快过期时，你判断"还有效"，但请求真正到服务器可能已经过了几百毫秒，刚好过期，返回 401（未认证）。

**答案**：不要卡点判断，提前留一个缓冲。

```java
long BUFFER = 60_000L;   // 提前 60 秒就算过期

boolean valid = token.expiresAt() - BUFFER > System.currentTimeMillis();
if (!valid) {
    token = login();   // 提前重新登录，换新 token
}
```

**逐行解释：**

- `token.expiresAt() - BUFFER`：过期时刻减去 60 秒，得到"最晚什么时候必须换新 token 的时刻"。
- 如果这个时刻还大于现在，说明离真正过期还有超过 60 秒，安全。
- 否则立刻重新登录。

**为什么这样更稳？** 因为从"判断有效"到"请求到达服务器"之间，网络、排队、GC 都可能吃掉时间。留 60 秒，等于给这些意外留了余量。

**还有一层兜底**：第三方系统返回的过期时间不可信。可能单位不对（秒当成毫秒），可能干脆没返回。所以要给默认值：

```java
long expiresAt = (expires > 0)
        ? expires                                  // 正常情况，用返回的
        : System.currentTimeMillis() + 12 * 3600_000L;  // 没返回，默认 12 小时
```

`12 * 3600_000L` 是 12 小时换算成毫秒：12 小时 × 3600 秒 × 1000 毫秒。注意末尾的 `L`，告诉 Java 这是 `long`，不然 `int` 可能溢出。

### 4.3 测耗时：用对时钟

最写法：

```java
long start = System.currentTimeMillis();
doSomething();
long cost = System.currentTimeMillis() - start;
log.info("耗时 {} ms", cost);
```

99% 的业务里这样写就够了。但要知道这两个方法的区别：

| 方法 | 是什么 | 会受什么影响 |
|---|---|---|
| `System.currentTimeMillis()` | 墙上时钟，1970 年至今的毫秒数 | 会被系统校时、手动改时间影响 |
| `System.nanoTime()` | 单调时钟，只增不减的纳秒数 | 不受校时影响，但起点任意 |

**类比：**

- `currentTimeMillis` 是**墙上的电子钟**，管理员可以调快调慢。
- `nanoTime` 是**秒表**，按下去就开始走，只会往前。

如果你在写框架、中间件，或者统计毫秒级以下的耗时，用 `nanoTime`：

```java
long start = System.nanoTime();
doSomething();
long costMicros = (System.nanoTime() - start) / 1_000;   // 微秒
```

**注意**：`nanoTime` 返回的数值**没有实际意义**（不是从 1970 年开始的），只能用来做**减法**。两个 `nanoTime` 相减才是时长。也不能把它存到数据库里，换台机器就对不上了。

### 4.4 格式化：不要用 SimpleDateFormat

**老写法（项目里还常见，但不要学）：**

```java
private static final SimpleDateFormat SDF =
        new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

public String format(Date date) {
    return SDF.format(date);   // 多线程下会出错！
}
```

**为什么错？** `SimpleDateFormat` 内部有一个 `Calendar` 字段，格式化时会改它。多个线程同时用同一个 `SDF` 对象，就像几个人抢同一支笔写同一张纸，最后写出来的东西是乱的。典型症状：偶尔出现日期错乱、或者抛出 `NumberFormatException`。

**正确写法：**

```java
private static final DateTimeFormatter FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

public String format(LocalDateTime time) {
    return FORMATTER.format(time);
}
```

`DateTimeFormatter` 是不可变对象，像一枚印章，谁盖都是一样的结果，天然线程安全。

**如果要处理时区，必须显式指定：**

```java
private static final DateTimeFormatter SHANGHAI_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                         .withZone(ZoneId.of("Asia/Shanghai"));

String text = SHANGHAI_FORMATTER.format(ZonedDateTime.now());
```

**注意**：`withZone` 之后，传进去的时间对象必须带时区信息（`ZonedDateTime` / `Instant` / `OffsetDateTime`）。传 `LocalDateTime` 会报错，因为它自己都不知道是哪个时区的。

**为什么必须写时区？** 服务器可能是 UTC。不写时区，格式化出来的就是 UTC 时间，比北京时间少 8 小时。这个 bug 只在线上出现，本地复现不了。

### 4.5 日期计算：别自己加减毫秒

**错误写法：**

```java
// 想要"明天"，于是加了 86400000 毫秒
LocalDate tomorrow = LocalDate.now().plusDays(1);   // 这个是对的
```

`plusDays(1)` 是对的，因为 `LocalDate` 内部会帮你处理月份翻转、闰年这些事。如果你自己算 `+ 86_400_000` 毫秒，跨时区、夏令时就可能出错。

**企业高频计算：**

```java
LocalDate today = LocalDate.now();

// 近 7 天（含今天）
LocalDate sevenDaysAgo = today.minusDays(6);

// 本月第一天
LocalDate firstDayOfMonth = today.withDayOfMonth(1);

// 上月最后一天
LocalDate lastDayOfLastMonth = firstDayOfMonth.minusDays(1);

// 两个日期之间隔了几天
long days = ChronoUnit.DAYS.between(sevenDaysAgo, today);   // 6？不，是 6 天差

// 算年龄（周岁）
Period period = Period.between(LocalDate.of(2000, 1, 1), today);
int age = period.getYears();
```

**一个真实坑**：`ChronoUnit.DAYS.between` 用来算"差几天"，但它对 `LocalDateTime` 算的是**完整的 24 小时数**：

```java
LocalDateTime a = LocalDateTime.of(2026, 11, 9, 23, 0);
LocalDateTime b = LocalDateTime.of(2026, 11, 10, 1, 0);

ChronoUnit.DAYS.between(a, b);   // 0，因为只差 2 小时
```

如果你想要"日历上跨了一天"，先转成 `LocalDate`：

```java
ChronoUnit.DAYS.between(a.toLocalDate(), b.toLocalDate());   // 1
```

**生活类比**：一个问"过了多少小时"，一个问"日历翻了几页"。你想要哪个，就用哪个。

### 4.6 数据库和 JSON：两个边界最容易丢时区

**① 数据库字段选哪个？**

| MySQL 类型 | 含义 | 适合 |
|---|---|---|
| `DATETIME` | 存什么读什么，不带时区 | 业务本地时间（报表日期、营业日） |
| `TIMESTAMP` | 存 UTC，读写按连接时区转换 | 真正的"时刻" |
| `BIGINT` | 存 epoch 毫秒 | 最不容易出错，适合跨系统 |

企业里比较稳的做法：**存一个统一时区（通常 UTC）的时间，展示时再转换到用户时区。**

**② MyBatis-Plus 自动填充创建时间/更新时间：**

不用每次手写 `setCreateTime`，配置一次就行：

```java
public class Order {
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;     // 插入时自动填

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;     // 插入和更新时都自动填
}
```

**③ Jackson 序列化：不加配置会输出成数组**

如果不配置，`LocalDateTime` 默认会序列化成这样：

```json
"createTime": [2026, 11, 9, 10, 0, 0]
```

前端看到这个会懵。要配置成字符串：

```java
@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
private LocalDateTime createTime;
```

或者在 `application.yml` 里全局配：

```yaml
spring:
  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: Asia/Shanghai
    serialization:
      write-dates-as-timestamps: false
```

---

## 五、老 API 的坑（知道就行，不要用）

### 5.1 `Date`：设计糟糕，别再用

`java.util.Date` 是 Java 1.0 的类。它的 `getYear()` 返回的年份是**从 1900 年算起的偏移量**：2026 年返回 126。`getMonth()` 返回 0-11，1 月是 0。

**新代码一律用 `java.time`。** 确实需要和老代码互转时：

```java
Date date = Date.from(instant);        // Instant -> Date
Instant instant = date.toInstant();    // Date -> Instant
```

### 5.2 `Calendar`：月份从 0 开始

```java
Calendar c = Calendar.getInstance();
c.set(2026, 10, 9);   // 这里的 10 表示 11 月！
```

因为太反直觉，早就被 `java.time` 取代了。

### 5.3 `SimpleDateFormat`：线程不安全

前面说过了，多线程共享会出事。**要么每次 new 一个（性能差），要么用 `DateTimeFormatter`。**

---

## 六、时区事故的三个典型现场

### 现场一：服务器是 UTC，本地是北京时间

你在本地写：

```java
LocalDate today = LocalDate.now();
// 本地看到：2026-11-09
```

代码上线到 UTC 容器，北京时间 11 月 9 日凌晨 1 点时，UTC 还是 11 月 8 日。于是：

```java
LocalDate today = LocalDate.now();   // 线上得到 2026-11-08
```

日报统计少一天，财务对账对不上。

**解决**：显式指定时区。

```java
LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
```

### 现场二：接口传了不带时区的时间字符串

```json
{ "createTime": "2026-11-09 10:00:00" }
```

这个字符串到底是北京时间还是 UTC？没人知道。美国服务收到后按自己的时区解析，差了 13 个小时。

**解决**：接口层传 epoch 毫秒（纯数字，无歧义），或者传 ISO-8601 带偏移量：

```
2026-11-09T10:00:00+08:00
```

### 现场三：定时任务在错误的时间执行

```java
@Scheduled(cron = "0 0 2 * * ?")   // 想每天凌晨 2 点跑
```

很多人以为是北京时间凌晨 2 点。但 cron 用的是 **JVM 默认时区**。服务器是 UTC，那就变成了北京时间上午 10 点跑。

**解决**：

```java
@Scheduled(cron = "0 0 2 * * ?", zone = "Asia/Shanghai")
```

或者在启动参数里统一固定时区：

```bash
-Duser.timezone=Asia/Shanghai
```

---

## 七、测试时间代码：不要用 sleep

新手常写：

```java
@Test
void test() throws Exception {
    doSomethingAsync();
    Thread.sleep(1000);          // 等 1 秒
    assertTrue(result);          // 祈祷 1 秒够用
}
```

这段测试有两个问题：

1. **慢**。跑一次至少 1 秒，测试多了很浪费时间。
2. **不稳定**。机器忙的时候 1 秒可能不够，测试随机失败。

**正确做法**：把"现在几点"抽成可注入的参数，用 `Clock` 控制。

```java
public LocalDate today(Clock clock) {
    return LocalDate.now(clock);
}

// 测试时固定时间
Clock fixed = Clock.fixed(
        Instant.parse("2026-11-09T00:00:00Z"),
        ZoneId.of("Asia/Shanghai")
);
assertEquals(LocalDate.of(2026, 11, 9), today(fixed));
```

业务代码里把 `Clock` 通过 Spring 注入，测试时传一个固定时间的 `Clock`，结果永远可预测。

等异步结果应该用专门的工具（比如 `Awaitility`），而不是 `sleep`：

```java
await().atMost(5, TimeUnit.SECONDS)
       .until(() -> resultIsReady());
```

它会在条件满足时立刻返回，不会死等固定时间。

---

## 八、速查表

```java
// ========== 获取当前时间 ==========
Instant.now();                                  // UTC 时刻
LocalDateTime.now();                            // 本地墙上时间（受服务器时区影响）
LocalDate.now();                                // 今天
System.currentTimeMillis();                     // epoch 毫秒
System.nanoTime();                              // 单调时钟，只能做减法

// ========== 时间戳互转 ==========
localDateTime.atZone(ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli();
Instant.ofEpochMilli(ts).atZone(ZoneId.of("Asia/Shanghai")).toLocalDateTime();

// ========== 格式化 ==========
DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
fmt.format(LocalDateTime.now());
LocalDateTime.parse("2026-11-09 10:00:00", fmt);

// ========== 日期计算 ==========
today.plusDays(1);
today.minusMonths(1);
today.withDayOfMonth(1);                       // 本月第一天
ChronoUnit.DAYS.between(start.toLocalDate(), end.toLocalDate());

// ========== 判断 ==========
a.isBefore(b);
a.isAfter(b);
a.toInstant().equals(b.toInstant());           // 比时刻，不比对象

// ========== 时长 ==========
Duration d = Duration.between(start, end);
d.toMillis();
Duration.ofSeconds(30);
```
---

## 结语

时间处理的难点不在 API 记不记得住，而在**你有没有想清楚"我手上这个是时刻、本地时间、还是时长"**。想清楚这一点，选型自然不会错。

剩下的就是几条纪律：

- 服务器统一时区，并在代码里显式声明时区；
- 接口传 epoch 或带偏移量的 ISO-8601；
- 格式化用 `DateTimeFormatter`，别用 `SimpleDateFormat`；
- 日期加减用 `plus/minus`，别自己算毫秒；
- 测试注入 `Clock`，不要 `sleep`。

时间 bug 很少让程序崩溃，它更像"数字悄悄对不上"——更难排查，也更应该在写代码时就防住。
