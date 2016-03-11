# Pluggable

[![Circle CI](https://circleci.com/gh/interlockjs/pluggable.svg?style=svg)](https://circleci.com/gh/interlockjs/pluggable)

Write your framework or application code in a functional style, and Pluggable will allow consumers of your code to override or transform any part of execution.

Async is fully supported via Promises, and a code analytics tool is made available to compile a dependency graph with metadata for all pluggables you've defined in your code.

## Define a `pluggable`

A pluggable function is defined like so:

```javascript
const myFunctionName = pluggable(function myFunctionName (myArg) {
  // reference functions this.depA, this.depB, and this.depC
}, { depA, depB, depC });
```

It's normal function equivalent would look like:

```javascript
function myFunctionName (myArg) {
  // reference functions depA, depB, and depC
}
```


## Define a plugin

```javascript
const myPlugin = function (override, transform) {
  // Any data to persist direct pluggable invocation should be defined here.

  // Use `override` if you'd like to completely change the implementation of
  // a pluggable function.
  override("somePluggableDependency", function (username) {
    if (CONDITION) {
      return somethingOtherThanDefaultValue;
    }
    // If you'd like to only override a pluggable's behavior in certain
    // circumstances, you can CONTINUE to the next pluggable override
    // or the default behavior.
    return override.CONTINUE;
  });

  // Use `transform` if you'd like to modify the output of a pluggable function.
  transform("getUserData", function (value, args) {
    // You have access to the pluggable function's output as `value` here.
    // You have access to the originally-passed arguments as `arg` here.
    return Object.assign({}, value, { iveBeenTransformed: true });
  });
}
```


## Get a pluggable context and invocation

```javascript
import { getBaseContext } from "pluggable";
const cxt = getBaseContext(
  { anything: "you want to go in this goes here" },
  [ AllOfYour, Plugins, GoHere ]
);
myPluggableFunction.call(cxt, allOf, your, normalArgs);
```

## Full Example

How this works is more easily explained using an example.  Imagine you had a module that looked something like this:

```javascript
import github from "github";

function buildSummaryString (userData) {
  const [signupDate, projects, contactInfo] = userData;
  return `User "${username}" signed up on ${signupDate} and has ${projects.length} projects.`;
}

function getUserData (username) {
  return Promise.all(
    github.getSignupDate(username),
    github.getProjects(username),
    github.getContactInfo(username)
  );
}

function getUserSummaries (usernames) {
  return Promise.all(usernames.map(username => {
    return getUserData(username).then(buildSummaryString);
  }));
}

// Which would be used like so.
getUserSummaries(["divmain"]).then(console.log);
```

This is a simple pattern of inputs and outputs - it is easy to test, and easy to reason about.

However, what if you'd like to allow consumers of this module to modify the behavior of one of the functions.  What if they want to add additional information, or what if they want to override the behavior altogether?  That's where `pluggable` comes in.

First, let's rewrite the above example using pluggables - then we'll look at how to modify behavior.

```javascript
import github from "github";
import { pluggable } from "pluggable";

const buildSummaryString = pluggable(function buildSummaryString (userData) {
  const [signupDate, projects, contactInfo] = userData;
  return `User "${username}" signed up on ${signupDate} and has ${projects.length} projects.`;
});

const getUserData = pluggable(function getUserData (username) {
  return Promise.all(
    github.getSignupDate(username),
    github.getProjects(username),
    github.getContactInfo(username)
  );
});

const getUserSummaries = pluggable(function getUserSummaries (usernames) {
  return Promise.all(usernames.map(username => {
    return this.getUserData(username).then(this.buildSummaryString.bind(this));
  }));
}, { buildSummaryString, getUserData });
```

You'll want to especially take note of the changes in `getUserSummaries`.  Instead of referring to `getUserData` and `buildSummaryString` directly, it refers to `this.getUserData` and `this.buildSummaryString`.  Under the hood, `pluggable` creates `this` contexts that make pluggable dependencies available.

Now lets look at how this might be invoked:

```javascript
import { getBaseContext } from "pluggable";
const cxt = getBaseContext();
getUserSummaries.call(cxt, ["divmain"]);
```

There's not much extra here beyond the original implementation, aside from providing a context for the function invocation.

Now let's look at how you might implement a caching plugin.

```javascript
const cacheUserData = function (override, transform) {
  const cache = {};

  override("getUserData", function (username) {
    if (username in cache) {
      return cache[username];
    }
    return override.CONTINUE;
  });

  // NOTE: we're not actually transforming the output here, although we could.
  transform("getUserData", function (userData, args) {
    const [username] = args;
    cache[username] = userData;
    return userData;
  });
}
```

You'd invoke `getUserSummaries` like so:

```javascript
import { getBaseContext } from "pluggable";
const cxt = getBaseContext({}, [ cacheUserData ]);
getUserSummaries.call(cxt, ["divmain"]);
```


