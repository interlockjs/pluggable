import getBaseContext from "../../src/get-base-context";

describe("getBaseContext", () => {
  it("returns context with provided props", () => {
    const cxt = getBaseContext({ a: "2", b: "3" });

    expect(cxt).to.have.property("a", "2");
    expect(cxt).to.have.property("b", "3");
  });

  it("invokes provided plugin functions", () => {
    const plugin = sinon.spy();
    getBaseContext({}, [plugin]);

    expect(plugin).to.have.been.calledOnce;
  });

  it("creates an override entry", () => {
    const overrideSomeFunction = sinon.spy();
    const plugin = function (override) {
      override("someFunction", overrideSomeFunction);
    };
    const cxt = getBaseContext({}, [plugin]);

    expect(cxt)
      .to.have.property("__pluggables__").and
      .to.have.property("override").and
      .to.have.property("someFunction").and
      .to.have.length(1); // eslint-disable-line no-magic-numbers

    expect(overrideSomeFunction).not.to.have.been.called;
    cxt.__pluggables__.override.someFunction[0](); // eslint-disable-line no-magic-numbers
    expect(overrideSomeFunction).to.have.been.calledOnce;
  });

  it("creates a transform entry", () => {
    const transformSomeFunction = sinon.spy();
    const plugin = function (override, transform) {
      transform("someFunction", transformSomeFunction);
    };
    const cxt = getBaseContext({}, [plugin]);

    expect(cxt)
      .to.have.property("__pluggables__").and
      .to.have.property("transform").and
      .to.have.property("someFunction").and
      .to.have.length(1); // eslint-disable-line no-magic-numbers

    expect(transformSomeFunction).not.to.have.been.called;
    cxt.__pluggables__.transform.someFunction[0](); // eslint-disable-line no-magic-numbers
    expect(transformSomeFunction).to.have.been.calledOnce;
  });

  it("exposes override.CONTINUE to plugins", () => {
    const plugin = function (override) {
      expect(override).to.have.property("CONTINUE");
    };
    getBaseContext({}, [plugin]);
  });
});
