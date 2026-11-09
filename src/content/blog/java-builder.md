---
title: "Java Builder 模式：从“会用”到“用对”"
description: "Builder 大概是 Java 里最容易被滥用、也最容易被误解的设计模式之一。很多人会写 `.builder().xxx().build()`，但说不清它到底解决了什么问题、什么时候不该用。这篇文章把 Builder 的核心机制、关键设计决策和常见坑一次讲清楚。"
pubDate: "2026-11-05"
category: "技术文章"
tags: []
draft: false
---


## 一、Builder 到底解决什么问题

Java 没有命名参数，也没有默认参数。当一个对象字段多、大多可选时，会连续踩三个坑。

### 坑 1：构造器爆炸

```java
new User("张三");
new User("张三", 18);
new User("张三", 18, "北京");
new User("张三", 18, "北京", true);
```

每加一个可选字段就多一个构造器，参数一多就记不住顺序。

### 坑 2：可读性灾难

```java
new User("张三", 18, "北京", true, null, null, false);
```

第 5 个 `null` 是什么？没人知道。参数错位编译器也不会报错。

### 坑 3：JavaBeans 模式破坏不可变性

```java
User u = new User();
u.setName("张三");
u.setAge(18);
```

对象在构造过程中可能处于非法状态，有 setter 就不是不可变对象，不能安全共享。

**Builder 的定位**：用一个可变草稿分步收集参数，最后由 `build()` 一次性生成不可变成品。

---

## 二、本质：草稿与成品是两个对象

Builder 模式里只有三个角色：

| 角色 | 职责 |
|---|---|
| 成品类 | 不可变，字段 `final`，构造器私有 |
| Builder | 可变草稿，收集参数，提供 `build()` |
| 调用方 | 链式配置，最后拿到成品 |

数据流只有一条：

```
调用方 → Builder（可变草稿）→ build() → 成品（不可变）
```

记住一句话：**Builder 是过程，成品是结果。**

---

## 三、最小可用骨架

```java
public final class User {
    private final String name;
    private final int age;

    private User(String name, int age) {
        this.name = name;
        this.age = age;
    }

    public static Builder builder(String name) {
        return new Builder(name);
    }

    public static final class Builder {
        private final String name;
        private int age;

        private Builder(String name) {
            this.name = name;
        }

        public Builder age(int age) {
            this.age = age;
            return this;       // 把草稿还给你
        }

        public User build() {
            return new User(name, age);   // 定稿
        }
    }
}
```

只有三个要点：

1. **成品构造器私有**：外人只能走 Builder；
2. **链式方法 `return this`**：所以能一直往下点；
3. **`build()` 才创建成品**：之前所有操作都只是在改草稿。

---

## 四、四个关键设计决策

### 1. 必填字段放哪？

放进 Builder 的构造器参数里，利用方法签名强制传参：

```java
public static Builder builder(String name) { ... }
```

不传就编译报错。也可以无参 `builder()`，在 `build()` 里检查并抛异常，但错误会推迟到运行期。

> 想要编译期报错，就必须让必填值出现在方法签名里。

### 2. 默认值放哪？

放在 Builder 字段初始化，而不是 `build()` 里：

```java
private String method = "GET";
private int retries = 3;
```

`build()` 里写 `if (x == null) x = ...` 会让默认值分散、每次多判断，还容易漏。

注意区分“默认值”和 `null`：

- 没指定时有合理默认 → 给默认值；
- “没有”本身有意义 → 用包装类型留 `null`。

不要用 `0` 假装“没有”，否则分不清“0 岁”和“没填”。

### 3. 校验放哪？

| 校验类型 | 放哪里 | 原因 |
|---|---|---|
| 单字段（非空、范围） | setter 或 `build()` | setter 报错更早，`build()` 兜底 |
| 跨字段（`start < end`） | 只能放 `build()` | 填一个字段时，另一个可能还没填 |
| 必填但没放签名里 | `build()` | 最后一个能检查的时机 |

`build()` 不负责“尽早”，它负责“绝不放行非法成品”。

### 4. 集合要不要复制？

```java
public User build() {
    return new User(name, tags);   // ❌ 共享同一个 List
}
```

Builder 和成品拿着两个引用，控制同一个 List。`build()` 之后 Builder 再改，成品也跟着变。

修复：

```java
public User build() {
    return new User(name, List.copyOf(tags));   // ✅ 复制 + 不可变
}
```

注意 `List.copyOf` 是**浅拷贝**，且不接受 null 元素。如果元素本身可变，需要深拷贝。

另外，防御性拷贝保护的是 **`build()` 之后**的修改；`build()` 之前的修改会被算进成品。

---

## 五、进阶：Step Builder

普通 Builder 的问题是：必填字段也能忘。

```java
Request.builder().method("GET").build();   // 运行时才报错
```

Step Builder 用接口把“下一步该填什么”约束在编译期：

```java
public interface UrlStep {
    MethodStep url(String url);
}

public interface MethodStep {
    BuildStep method(String method);
}

public interface BuildStep {
    Request build();
}

public final class Request {
    public static UrlStep builder() {
        return new Builder();
    }

    private static final class Builder implements UrlStep, MethodStep, BuildStep {
        private String url;
        private String method;

        @Override public MethodStep url(String url) {
            this.url = url;
            return this;
        }

        @Override public BuildStep method(String method) {
            this.method = method;
            return this;
        }

        @Override public Request build() {
            return new Request(url, method);
        }
    }
}
```

用法：

```java
Request r = Request.builder()   // 类型：UrlStep
        .url("https://a.com")   // 类型变成 MethodStep
        .method("GET")          // 类型变成 BuildStep
        .build();
```

关键原理：**能调什么方法，取决于表达式的静态类型，而不是对象实际有什么方法。**

`builder()` 返回 `UrlStep`，接口里只声明了 `url(...)`，所以 `.method(...)` 不可见；调用 `.url(...)` 后返回 `MethodStep`，`.method(...)` 才被“放开”。

代价：接口数量会随必填字段增长，顺序也被固定。适合必填字段少（2~3 个）、顺序自然的场景。

---

## 六、两种省力写法

### 1. Lombok `@Builder`

```java
@Builder
public record User(String name, int age, String city) { }
```

自动生成 `User.builder().name(...).age(...).build()`。

- `@Builder.Default`：默认值；
- `@Singular`：集合字段；
- `@SuperBuilder`：支持继承；
- `toBuilder = true`：生成 `toBuilder()`。

优点：零样板。缺点：不能自定义 `build()` 逻辑，跨字段校验只能挪到构造器里。

### 2. Wither

```java
record User(String name, int age, String city) {
    User withAge(int age) {
        return new User(name, age, city);
    }
}
```

```java
User u2 = u1.withAge(20);   // 新对象，u1 不变
```

优点：没有中间可变对象，逻辑最简单。
缺点：字段一多，每个 `withXxx` 都要抄一遍其他字段，代码量是 O(n²)。

---

## 七、什么时候不该用 Builder

Builder 不是“越用越专业”，它有成本：多一个类、多一堆方法、成品和 Builder 两处要同步维护。

| 情况 | 更简单的写法 |
|---|---|
| 字段 ≤ 3 且全必填 | 构造器 / 静态工厂 |
| 没有可选字段 | 构造器 |
| 简单值对象 | record 直接 `new` |
| 对象本来就该可变 | setter |
| 只是想链式好看 | Fluent API |
| 已经用 Lombok | `@Builder` |

判断线：

```text
字段 ≤ 3 且全必填？
├─ 是 → 构造器 / 静态工厂
└─ 否
   ├─ 可选字段 ≥ 3，或需要默认值/校验？
   │   ├─ 是 → Builder
   │   └─ 否 → 构造器 / 静态工厂
   └─ 需要“改副本”多于“从零创建”？
       └─ 是 → wither
```

---


## 八、总结

> **Builder = 可变草稿 + 链式配置 + 一次性冻结成不可变成品。**

它最擅长解决“多可选参数 + 不可变对象 + 跨字段校验”，而不是“所有类都该有一个 Builder”。

判断用不用它，只看两件事：**字段多不多、可选多不多**。至于对象是不是 `record`、类里有没有别的模式，都不是决定因素——`record` 管“存”，Builder 管“造”，两者可以叠加。

---
