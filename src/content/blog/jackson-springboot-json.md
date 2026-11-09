---
title: "Jackson 常用注解大全（SpringBoot 默认 JSON 序列化框架）"
description: "jackson常用注解"
pubDate: "2026-11-05"
updatedDate: "2026-11-05"
category: "技术文章"
tags:
  - "后端"
draft: false
---

### 一.依赖与导包
### 1. dependency（pom.xml）

```
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>
```

作用：让 Maven 把 Jackson 的 jar 包下载到本地，项目运行时才有这些类。

✅ 而 spring-boot-starter-web **已经自带这个依赖**，如果你项目已经引了 web，pom 里这一段可以不写，重复写也没关系。

👉注意：
`jackson-databind` 内部会自动依赖另外两个：

- `jackson-core`（底层流）
- `jackson-annotations`（所有 `@JsonXXX` 注解就在这个包里！）
所以你不用单独引入 `jackson-annotations`。

## 补充一个小坑

Java8 时间类型 `LocalDateTime` 序列化，如果发现格式化有问题，还需要额外一个依赖：

```
<dependency>
    <groupId>com.fasterxml.jackson.datatype</groupId>
    <artifactId>jackson-datatype-jsr310</artifactId>
</dependency>
```

新版 SpringBoot 一般 starter-web 也自带了，老版本才需要手动加。

### 2. import（Java 代码）

```
// 只用了 @JsonInclude，只需要这一条
import com.fasterxml.jackson.annotation.JsonInclude;

// 如果后面还要 @JsonProperty、@JsonIgnore，就要再加 import
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;
```

作用：Java 代码里，你要使用哪个注解，**就要 import 对应的类**。

## 一句话总结

- ✅ **依赖：只需要引入一次 jackson-databind（web 自带），所有 Jackson 注解都有了。**
- ❌ **import：每个注解对应的类，需要分别导入；没有 “一次 import 全部注解” 的写法。**

### 二.常用的注解

**1. @JsonInclude**
**作用**：序列化时，根据字段值条件决定要不要输出这个字段

使用位置：类上 / 单个字段上

```
// 类上：全部字段生效
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class User {
    private Long id;
    private String name;
    private String email;
}
```

示例代码

```
User u = new User();
u.setId(1L);
u.setName("张三");
// email = null
```

输出对比

不加（默认 ALWAYS）：

```
{"id":1,"name":"张三","email":null}
```

加 NON_NULL：

```
{"id":1,"name":"张三"}
```

枚举选项

- `NON_NULL`：值为 null 不输出
- `NON_EMPTY`：null、空串`""`、空集合`[]`、空 Map 都不输出
- `ALWAYS`：默认，全部输出
- `NON_DEFAULT`：等于字段默认值时不输出（int=0、boolean=false）

⚠️ 坑点

- NON_NULL **只管 null**，空字符串 `""`、数字 0、false 依旧输出
- 只控制序列化（对象→JSON），反序列化不受影响

**2. @JsonIgnore**
**作用**：序列化、反序列化双向忽略该字段

使用位置：字段上

```
@Data
public class User {
    private Long id;
    private String name;
    @JsonIgnore
    private String password;
}
```

示例代码

```
User u = new User();
u.setId(1L);
u.setName("张三");
u.setPassword("123456");
```

输出对比

不加：

```
{"id":1,"name":"张三","password":"123456"}
```

加 @JsonIgnore：

```
{"id":1,"name":"张三"}
```

⚠️ 坑点

- 双向忽略：JSON 传了 password，也不会赋值进对象
- 适合密码、密钥这类敏感字段
- 和 `WRITE_ONLY` 区分：WRITE_ONLY 可以接收前端传值，只是不返回

**3. @JsonIgnoreProperties**
**作用**：作用在反序列化上，批量忽略一批字段；或者开启忽略未知字段

使用位置：类上

```
// 写法1：指定忽略字段
@Data
@JsonIgnoreProperties({"password", "secret"})
public class User {
    private Long id;
    private String name;
    private String password;
    private String secret;
}

// 写法2：ignoreUnknown = true 【超级常用】
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class User {
    private Long id;
    private String name;
}
```

示例
前端传 JSON：`{"id":1,"name":"张三","age":18}`
age 实体里没有

- 不加这个注解：反序列化直接抛异常 Unrecognized field
- 加 `ignoreUnknown = true`：age 直接丢弃，不报错

⚠️ 坑点

- `ignoreUnknown=true` 只作用于**反序列化**

**## 4. @JsonProperty**

**作用**：修改 JSON 的 key 名称；还可以控制读写权限（READ_ONLY / WRITE_ONLY）

使用位置：字段 /getter/setter

```
@Data
public class User {
    private Long id;
    @JsonProperty("user_name")
    private String userName;

    // WRITE_ONLY：只写，前端能传，返回不输出
    @JsonProperty(value = "pwd", access = JsonProperty.Access.WRITE_ONLY)
    private String password;
}
```

示例代码

```
User u = new User();
u.setId(1L);
u.setUserName("张三");
u.setPassword("123456");
```

输出：

```
{"id":1,"user_name":"张三"}
```

权限说明

- `WRITE_ONLY`：反序列化可读，序列化不输出（密码首选）
- `READ_ONLY`：序列化输出，前端传过来的值不接收
- `AUTO`：默认，可读可写

⚠️ 坑点

- 双向生效：序列化输出改名，反序列化也用这个 key 接收
- 和 @JsonAlias 区分：Alias 只是别名，输出 key 不变

**## 5. @JsonAlias**

**作用**：反序列化时支持多个别名 key 映射到同一个字段；序列化输出仍然是原字段名

使用位置：字段上

```
@Data
public class User {
    private Long id;
    @JsonAlias({"username", "u_name"})
    private String userName;
}
```

示例
下面三种 JSON 都可以成功给 userName 赋值

```
{"userName":"张三"}
{"username":"张三"}
{"u_name":"张三"}
```

序列化输出永远是：

```
{"id":1,"userName":"张三"}
```

⚠️ 坑点

- **只对反序列化生效！序列化不会输出别名**
- 不能用来修改返回给前端的 key 名，改名要用 @JsonProperty

**## 6. @JsonFormat**

**作用**：日期时间格式化，序列化 + 反序列化同时生效

使用位置：日期字段上

```
@Data
public class User {
    private Long id;
    private String name;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private LocalDateTime createTime;
}
```

示例

```
User u = new User();
u.setId(1L);
u.setName("张三");
u.setCreateTime(LocalDateTime.of(2026,11,5,14,30,0));
```

输出：

```
{"id":1,"name":"张三","createTime":"2026-11-05 14:30:00"}
```

⚠️ 坑点

- `timezone = "GMT+8"` 一定要写，否则时区错乱，时间差 8 小时
- LocalDateTime（Java8 时间类）老版本 jackson 需要 jsr310 依赖
- 只控制格式，不能做时区转换逻辑；前端传格式不对会反序列化报错

**## 7. @JsonValue**

**作用**：枚举序列化时，输出这个注解标记方法的返回值，而不是枚举名称

使用位置：枚举里面的 get 方法上

```
public enum StatusEnum {
    NORMAL(1, "正常"),
    DISABLE(0, "禁用");
    private Integer code;
    private String desc;
    StatusEnum(Integer code, String desc){
        this.code = code;
        this.desc = desc;
    }
    @JsonValue
    public Integer getCode() {
        return code;
    }
}
```

示例

```
StatusEnum s = StatusEnum.NORMAL;
```

不加注解默认输出：`"NORMAL"`

加 @JsonValue 输出：`1`

⚠️ 坑点

- 一个枚举**只能有一个 @JsonValue**
- 默认反序列化也会按这个值解析；复杂枚举反序列化一般搭配 @JsonCreator

 **## 8. @JsonCreator**

**作用**：指定反序列化调用的构造方法 / 静态工厂方法，用来解决枚举、复杂对象反序列化

使用位置：构造方法 / 静态方法

```
public enum StatusEnum {
    NORMAL(1, "正常"),
    DISABLE(0, "禁用");
    private Integer code;
    private String desc;
    StatusEnum(Integer code, String desc){
        this.code = code;
        this.desc = desc;
    }
    @JsonValue
    public Integer getCode() {
        return code;
    }
    @JsonCreator
    public static StatusEnum getByCode(@JsonProperty("code") Integer code){
        for (StatusEnum e : StatusEnum.values()) {
            if(e.getCode().equals(code)){
                return e;
            }
        }
        return null;
    }
}
```

示例
JSON：`0` → 反序列化为 StatusEnum.DISABLE

⚠️ 坑点

- 方法参数必须配合 @JsonProperty 标记参数名
- 多用于枚举反序列化，普通 POJO 一般很少用

**## 9. @JsonUnwrapped**

**作用**：把嵌套对象里面的字段平铺，直接合并到外层 JSON
使用位置：嵌套对象字段上

```
@Data
class Address{
    private String province;
    private String city;
}

@Data
public class User {
    private Long id;
    private String name;
    @JsonUnwrapped
    private Address address;
}
```

示例

```
User u = new User();
u.setId(1L);
u.setName("张三");
Address addr = new Address();
addr.setProvince("浙江");
addr.setCity("舟山");
u.setAddress(addr);
```

不加注解输出：

```
{"id":1,"name":"张三","address":{"province":"浙江","city":"舟山"}}
```

加 @JsonUnwrapped：

```
{"id":1,"name":"张三","province":"浙江","city":"舟山"}
```

⚠️ 坑点

- 如果嵌套对象为 null，默认不会产生任何字段
- 多个嵌套对象平铺时 key 重名会冲突

**## 10. @JsonPropertyOrder**

**作用**：指定 JSON 输出 key 的顺序

使用位置：类上

```
@Data
@JsonPropertyOrder({"id","name","email"})
public class User {
    private String email;
    private Long id;
    private String name;
}
```

输出固定顺序：

```
{"id":1,"name":"张三","email":"zs@xxx.com"}
```

不加注解：顺序不稳定，由 class 字节码顺序决定

⚠️ 坑点

- 只影响序列化输出顺序；JSON 本身规范不强制顺序，前端解析不受影响，只是好看

**## 11. @JsonAnyGetter & @JsonAnySetter**

**作用**：一对组合，动态扩展字段

- @JsonAnyGetter：Map 里面的 key 平铺输出到 JSON
- @JsonAnySetter：JSON 里所有找不到对应属性的字段，全部丢进这个 Map

使用位置：get 方法 /set 方法

```
@Data
public class User {
    private Long id;
    private String name;
    private Map<String,Object> ext = new HashMap<>();

    @JsonAnyGetter
    public Map<String, Object> getExt() {
        return ext;
    }
    @JsonAnySetter
    public void setExt(String key, Object value) {
        this.ext.put(key, value);
    }
}
```

示例传入 JSON：

```
{"id":1,"name":"张三","age":18,"sex":"男"}
```

age、sex 不属于实体字段，会存入 ext
序列化输出：

```
{"id":1,"name":"张三","age":18,"sex":"男"}
```

⚠️ 坑点

- 和 `@JsonIgnoreProperties(ignoreUnknown=true)` 相反：一个存起来，一个直接丢掉
- 适合不确定扩展字段的场景

# 📌 配套全局配置 yml（一次性统一规则，少写注解）

```
spring:
  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: GMT+8
    default-property-inclusion: non_null
```

（后续若碰到注解，会再加上）
