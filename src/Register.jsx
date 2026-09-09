import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import darkLogo from "./assets/logoda.png";
import { getBlocks, getDistricts, getUlbs, getVillages, postAuth, searchIndustries, searchInstitutions } from "./api/referenceData";
import UtilityBar from "./UtilityBar";
import { usePreferences } from "./usePreferences";
import "./Register.css";

const roles = [
  ["citizen", "Citizen", "Report local problems and follow their progress."],
  ["hei", "HEI", "Collaborate through a higher education institution."],
  ["industry", "Industry", "Contribute expertise, mentorship, or resources."],
  ["government", "Government", "Coordinate public services and local solutions."],
];

function SearchSelect({ kind, selected, search, results, loading, error, onSearchChange, onSelect, onRetry }) {
  const noun = kind === "institution" ? "institution" : "organization";
  const detail = (item) => kind === "institution"
    ? `AISHE: ${item.aisheCode} · ${item.institutionType}`
    : `${item.organizationType} · ${item.district?.name || "Jharkhand"}`;

  return (
    <div className="register-search-wrap">
      <div className="register-search">
        <label htmlFor={`${kind}-search`}>{kind === "institution" ? "Search by institution name or AISHE Code" : "Search by organization name or type"}</label>
        <input id={`${kind}-search`} value={search} onChange={onSearchChange} placeholder={`Search ${noun} name or ${kind === "institution" ? "AISHE Code" : "type"}`} autoComplete="off" />
      </div>
      {search.trim().length > 0 && search.trim().length < 2 && <p className="register-search-feedback" role="status">Enter at least 2 characters to search.</p>}
      {loading && <p className="register-search-feedback" role="status">Searching {noun}s…</p>}
      {error && <div className="register-search-feedback register-search-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Try again</button></div>}
      {search.trim().length >= 2 && !loading && !error && results.length === 0 && <p className="register-search-feedback" role="status">No matching {noun}s found.</p>}
      {results.length > 0 && <div className="register-result-list" role="group" aria-label={`Available ${noun}s`}>{results.map((item) => <button type="button" key={item._id} className={selected?._id === item._id ? "is-selected" : ""} onClick={() => onSelect(item)} aria-pressed={selected?._id === item._id}><span><strong>{kind === "institution" ? item.institutionName : item.organizationName}</strong><small>{detail(item)}</small></span><span aria-hidden="true">{selected?._id === item._id ? "✓" : "→"}</span></button>)}</div>}
    </div>
  );
}

function Input({ label, name, type = "text", placeholder, required = true, value, onChange, autoComplete, minLength }) {
  return <div className="register-input-group"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} placeholder={placeholder} value={value} onChange={onChange} required={required} autoComplete={autoComplete} minLength={minLength} /></div>;
}

function AccountDetails({ form, onChange }) {
  return <><Input label="Full name" name="fullName" placeholder="Enter your full name" value={form.fullName || ""} onChange={onChange} autoComplete="name" /><Input label="Email address" name="email" type="email" placeholder="you@example.com" value={form.email || ""} onChange={onChange} autoComplete="email" /><Input label="Phone number" name="phone" type="tel" placeholder="Enter your phone number" value={form.phone || ""} onChange={onChange} autoComplete="tel" /><Input label="Password" name="password" type="password" placeholder="Create a password" value={form.password || ""} onChange={onChange} autoComplete="new-password" minLength={8} /></>;
}

function ChoiceCards({ choices, selected, onSelect }) {
  return (
    <div className="register-choice-grid">
      {choices.map(([value, title, copy]) => (
        <button
          key={value}
          type="button"
          className={`register-choice-card ${selected === value ? "is-selected" : ""}`}
          onClick={() => onSelect(value)}
          aria-pressed={selected === value}
        >
          <span className="register-choice-dot" aria-hidden="true" />
          <strong>{title}</strong>
          {copy && <small>{copy}</small>}
        </button>
      ))}
    </div>
  );
}

function Actions({ step, onBack, submitLabel = "Continue", disabled = false, isSubmitting = false }) {
  return (
    <div className="register-actions">
      {step > 1 && <button type="button" className="register-back" onClick={onBack}>Back</button>}
      <button type="submit" className="register-submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? "Submitting…" : submitLabel}
      </button>
    </div>
  );
}

function SelectionActions({ step, onBack, disabled, onContinue }) {
  return (
    <div className="register-actions">
      {step > 1 && <button type="button" className="register-back" onClick={onBack}>Back</button>}
      <button type="button" className="register-submit" disabled={disabled} onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}

function Summary({ rows }) {
  return (
    <dl className="register-summary">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "Not provided"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Register() {
  const [preferences, updatePreferences] = usePreferences();
  const { theme, textScale } = preferences;
  const [role, setRole] = useState("");
  const [accountType, setAccountType] = useState("");
  const [governmentLevel, setGovernmentLevel] = useState("");
  const [organizationType, setOrganizationType] = useState("");
  const [institution, setInstitution] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [institutionSearch, setInstitutionSearch] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [institutionResults, setInstitutionResults] = useState([]);
  const [organizationResults, setOrganizationResults] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [villages, setVillages] = useState([]);
  const [ulbs, setUlbs] = useState([]);
  const [districtLoading, setDistrictLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [villageLoading, setVillageLoading] = useState(false);
  const [ulbLoading, setUlbLoading] = useState(false);
  const [districtError, setDistrictError] = useState("");
  const [blockError, setBlockError] = useState("");
  const [villageError, setVillageError] = useState("");
  const [ulbError, setUlbError] = useState("");
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [searchVersion, setSearchVersion] = useState(0);
  const [form, setForm] = useState({});
  const [step, setStep] = useState(1);
  const [complete, setComplete] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);
  const [registrationError, setRegistrationError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const isHeiAdmin = role === "hei" && accountType === "hei-admin";
  const isFacultyOrStudent = role === "hei" && ["faculty", "student"].includes(accountType);
  const isOrganizationAdmin = role === "industry" && accountType === "organization-admin";
  const isMentor = role === "industry" && accountType === "industry-mentor";
  const totalSteps = role === "citizen" ? 3 : role ? 4 : 3;

  useEffect(() => {
    const searchKind = step === 3 && (isHeiAdmin || isFacultyOrStudent) ? "institution" : step === 3 && isMentor ? "organization" : null;
    const query = searchKind === "institution" ? institutionSearch.trim() : organizationSearch.trim();

    if ((searchKind === "institution" && institution) || (searchKind === "organization" && organization)) {
      setReferenceLoading(false);
      setReferenceError("");
      if (searchKind === "institution") setInstitutionResults([]);
      if (searchKind === "organization") setOrganizationResults([]);
      return undefined;
    }

    if (!searchKind || query.length < 2) {
      setReferenceLoading(false);
      setReferenceError("");
      if (searchKind === "institution") setInstitutionResults([]);
      if (searchKind === "organization") setOrganizationResults([]);
      return undefined;
    }

    let isCurrentSearch = true;
    const timeout = window.setTimeout(async () => {
      setReferenceLoading(true);
      setReferenceError("");
      try {
        const results = searchKind === "institution"
          ? await searchInstitutions(query)
          : await searchIndustries(query);
        if (!isCurrentSearch) return;
        if (searchKind === "institution") setInstitutionResults(results);
        else setOrganizationResults(results);
      } catch (error) {
        if (isCurrentSearch) {
          setReferenceError(error.message || "Unable to load reference data. Please try again.");
        }
      } finally {
        if (isCurrentSearch) setReferenceLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      isCurrentSearch = false;
    };
  }, [step, isHeiAdmin, isFacultyOrStudent, isMentor, institution, organization, institutionSearch, organizationSearch, searchVersion]);

  useEffect(() => {
    if (role !== "government" || step !== 3 || governmentLevel === "STATE" || districts.length) return undefined;

    let isCurrentRequest = true;
    setDistrictLoading(true);
    setDistrictError("");
    getDistricts()
      .then((data) => {
        if (isCurrentRequest) setDistricts(data);
      })
      .catch((error) => {
        if (isCurrentRequest) setDistrictError(error.message || "Unable to load districts. Please try again.");
      })
      .finally(() => {
        if (isCurrentRequest) setDistrictLoading(false);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [role, step, governmentLevel, districts.length]);

  useEffect(() => {
    if (role !== "government" || step !== 3 || !["BLOCK", "RURAL"].includes(governmentLevel) || !form.districtId) return undefined;
    let isCurrentRequest = true;
    setBlockLoading(true);
    setBlockError("");
    getBlocks(form.districtId)
      .then((data) => { if (isCurrentRequest) setBlocks(data); })
      .catch((error) => { if (isCurrentRequest) setBlockError(error.message || "Unable to load blocks. Please try again."); })
      .finally(() => { if (isCurrentRequest) setBlockLoading(false); });
    return () => { isCurrentRequest = false; };
  }, [role, step, governmentLevel, form.districtId]);

  useEffect(() => {
    if (role !== "government" || step !== 3 || governmentLevel !== "LOCAL" || !form.districtId) return undefined;
    let isCurrentRequest = true;
    setUlbLoading(true);
    setUlbError("");
    getUlbs(form.districtId)
      .then((data) => { if (isCurrentRequest) setUlbs(data); })
      .catch((error) => { if (isCurrentRequest) setUlbError(error.message || "Unable to load urban local bodies. Please try again."); })
      .finally(() => { if (isCurrentRequest) setUlbLoading(false); });
    return () => { isCurrentRequest = false; };
  }, [role, step, governmentLevel, form.districtId]);

  useEffect(() => {
    if (role !== "government" || step !== 3 || governmentLevel !== "RURAL" || !form.blockId) return undefined;
    let isCurrentRequest = true;
    setVillageLoading(true);
    setVillageError("");
    getVillages(form.blockId)
      .then((data) => { if (isCurrentRequest) setVillages(data); })
      .catch((error) => { if (isCurrentRequest) setVillageError(error.message || "Unable to load villages. Please try again."); })
      .finally(() => { if (isCurrentRequest) setVillageLoading(false); });
    return () => { isCurrentRequest = false; };
  }, [role, step, governmentLevel, form.blockId]);

  const chooseRole = (value) => { setRole(value); setAccountType(""); };
  const chooseType = (value) => setAccountType(value);
  const chooseGovernmentLevel = (value) => setGovernmentLevel(value);
  const chooseOrganizationType = (value) => setOrganizationType(value);
  const selectInstitution = (selectedInstitution) => {
    setInstitution(selectedInstitution);
    setInstitutionSearch(selectedInstitution.institutionName);
    setInstitutionResults([]);
    setForm((current) => ({ ...current, institutionId: selectedInstitution._id, institutionName: selectedInstitution.institutionName, aisheCode: selectedInstitution.aisheCode }));
  };
  const selectOrganization = (selectedOrganization) => {
    setOrganization(selectedOrganization);
    setForm((current) => ({ ...current, organizationId: selectedOrganization._id, organizationName: selectedOrganization.organizationName, organizationType: selectedOrganization.organizationType, organizationDistrict: selectedOrganization.district }));
  };
  const changeReferenceSearch = (kind, value) => {
    if (kind === "institution") {
      setInstitutionSearch(value);
      setInstitution(null);
      setForm((current) => ({ ...current, institutionId: "", institutionName: "", aisheCode: "" }));
    } else {
      setOrganizationSearch(value);
      setOrganization(null);
      setForm((current) => ({ ...current, organizationId: "", organizationName: "", organizationType: "", organizationDistrict: "" }));
    }
  };
  const selectDistrict = (event) => {
    const selectedDistrict = districts.find((district) => district._id === event.target.value);
    setForm((current) => ({
      ...current,
      districtId: selectedDistrict?._id || "",
      districtName: selectedDistrict?.name || "",
      blockId: "",
      blockName: "",
      villageId: "",
      villageName: "",
      ulbId: "",
      ulbName: "",
    }));
    setBlocks([]);
    setVillages([]);
    setUlbs([]);
  };
  const selectBlock = (event) => {
    const selectedBlock = blocks.find((block) => block._id === event.target.value);
    setForm((current) => ({ ...current, blockId: selectedBlock?._id || "", blockName: selectedBlock?.name || "", villageId: "", villageName: "" }));
    setVillages([]);
  };
  const selectUlb = (event) => {
    const selectedUlb = ulbs.find((ulb) => ulb._id === event.target.value);
    setForm((current) => ({ ...current, ulbId: selectedUlb?._id || "", ulbName: selectedUlb?.name || "" }));
  };
  const selectVillage = (event) => {
    const selectedVillage = villages.find((village) => village._id === event.target.value);
    setForm((current) => ({ ...current, villageId: selectedVillage?._id || "", villageName: selectedVillage?.name || "" }));
  };
  const back = () => {
    if (step === 1) return;
    if (step === 2) { setRole(""); setStep(1); return; }
    if (step === 3) {
      if (role === "hei" || role === "industry") { setAccountType(""); }
      if (role === "government") { setGovernmentLevel(""); }
      setStep(2);
      return;
    }
    if (step === 4 && isOrganizationAdmin) { setOrganizationType(""); setStep(3); return; }
    setStep(3);
  };
  const submit = async (event) => {
    event.preventDefault();
    setRegistrationError("");
    const roleMap = {
      citizen: "CITIZEN",
      "hei-admin": "HEI_ADMIN",
      faculty: "FACULTY",
      student: "STUDENT",
      "organization-admin": "INDUSTRY_ADMIN",
      "industry-mentor": "INDUSTRY_MENTOR",
      government: "GOVERNMENT",
    };
    const userRole = role === "hei" || role === "industry" ? roleMap[accountType] : roleMap[role];
    const payload = { name: form.fullName, email: form.email, phone: form.phone, password: form.password, role: userRole };
    if (["HEI_ADMIN", "FACULTY", "STUDENT"].includes(userRole)) Object.assign(payload, { institutionId: form.institutionId, institutionName: form.institutionName, aisheCode: form.aisheCode });
    if (userRole === "INDUSTRY_ADMIN") Object.assign(payload, { organizationName: form.organizationName, organizationType });
    if (userRole === "INDUSTRY_MENTOR") Object.assign(payload, { organizationId: form.organizationId, organizationName: form.organizationName, organizationType: form.organizationType });
    if (userRole === "GOVERNMENT") Object.assign(payload, { governmentLevel, department: form.department, districtId: form.districtId, districtName: form.districtName, blockId: form.blockId, villageId: form.villageId, ulbId: form.ulbId });

    setIsSubmitting(true);
    try {
      const data = await postAuth("/auth/register", payload);
      setRegisteredUser(data.user);
      setComplete(true);
    } catch (error) {
      setRegistrationError(error.message || "Unable to create your account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const heading = () => {
    if (step === 1) return ["Create your account", "Which role best describes you?"];
    if (complete) return ["Registration complete", role === "citizen" ? "Account created successfully." : "Your registration has been submitted."];
    if (role === "citizen") return step === 2 ? ["Citizen account", "Tell us a little about yourself."] : ["Review your details", "Confirm your account information."];
    if (role === "hei") {
      if (step === 2) return ["HEI account", "Choose how you will use JanSamadhan."];
      if (step === 3) return ["Select institution", "Find your college or university."];
      return isHeiAdmin ? ["Verification details", "Help us verify your institution role."] : ["Institutional details", "A few details for your institution to verify."];
    }
    if (role === "industry") {
      if (step === 2) return ["Industry account", "Choose how you will participate."];
      if (step === 3 && isOrganizationAdmin) return ["Organization type", "Select the type that fits best."];
      if (step === 3) return ["Find organization", "Search for your organization or factory."];
      return isOrganizationAdmin ? ["Organization details", "Provide the details needed for review."] : ["Join organization", "Send your request to the organization."];
    }
    if (step === 2) return ["Government account", "Select your government level."];
    if (step === 3) return ["Government details", "Provide the details relevant to your level."];
    return ["Verification summary", "Review your government account request."];
  };
  const [eyebrow, title] = heading();

  const renderStep = () => {
    if (complete) return <div className="register-complete" role="status"><span aria-hidden="true">✓</span><h3>{registeredUser?.status === "ACTIVE" ? "Account created successfully." : "Registration successful"}</h3><p>{registeredUser?.status === "ACTIVE" ? "You can now use JanSamadhan with your new account." : "Your account is awaiting verification. You will be able to log in once it has been approved."}</p><Link to="/login" className="register-primary-link">Go to login</Link></div>;
    if (step === 1) return <><ChoiceCards choices={roles} selected={role} onSelect={chooseRole} /><SelectionActions step={step} onBack={back} disabled={!role} onContinue={() => setStep(2)} /></>;
    if (role === "citizen" && step === 2) return <form onSubmit={(event) => { event.preventDefault(); setStep(3); }}><AccountDetails form={form} onChange={setField} /><Actions step={step} onBack={back} isSubmitting={isSubmitting} /></form>;
    if (role === "citizen") return <form onSubmit={submit}><Summary rows={[["Name", form.fullName], ["Email", form.email], ["Phone", form.phone]]} /><Actions step={step} onBack={back} isSubmitting={isSubmitting} submitLabel="Create Account" /></form>;
    if (step === 2 && role === "hei") return <><ChoiceCards selected={accountType} onSelect={chooseType} choices={[["hei-admin", "HEI Admin", "Register and manage an institution."], ["faculty", "Faculty", "Participate through your institution."], ["student", "Student", "Contribute as a student."]]} /><SelectionActions step={step} onBack={back} disabled={!accountType} onContinue={() => setStep(3)} /></>;
    if (step === 2 && role === "industry") return <><ChoiceCards selected={accountType} onSelect={chooseType} choices={[["organization-admin", "Organization Admin", "Register an organization or factory."], ["industry-mentor", "Industry Mentor", "Join an existing organization."]]} /><SelectionActions step={step} onBack={back} disabled={!accountType} onContinue={() => setStep(3)} /></>;
    if (step === 2 && role === "government") return <><ChoiceCards selected={governmentLevel} onSelect={chooseGovernmentLevel} choices={[["LOCAL", "Local", "Municipal or urban local body."], ["RURAL", "Rural", "Panchayat or rural local body."], ["BLOCK", "Block", "Community Development Block administration."], ["DISTRICT", "District", "District administration."], ["STATE", "State", "State-level department."]]} /><SelectionActions step={step} onBack={back} disabled={!governmentLevel} onContinue={() => setStep(3)} /></>;
    if (step === 3 && (isHeiAdmin || isFacultyOrStudent)) return <form onSubmit={(event) => { event.preventDefault(); if (institution) setStep(4); }}><SearchSelect kind="institution" selected={institution} search={institutionSearch} results={institutionResults} loading={referenceLoading} error={referenceError} onSearchChange={(event) => changeReferenceSearch("institution", event.target.value)} onSelect={selectInstitution} onRetry={() => setSearchVersion((version) => version + 1)} /><Actions step={step} onBack={back} isSubmitting={isSubmitting} disabled={!institution} /></form>;
    if (step === 3 && isOrganizationAdmin) return <><ChoiceCards selected={organizationType} onSelect={chooseOrganizationType} choices={[["startup", "Startup", "Early-stage innovation company."], ["msme", "MSME", "Micro, small, or medium enterprise."], ["factory", "Factory", "Manufacturing organization."], ["research", "Research Organization", "Research and development institution."]]} /><SelectionActions step={step} onBack={back} disabled={!organizationType} onContinue={() => setStep(4)} /></>;
    if (step === 3 && isMentor) return <form onSubmit={(event) => { event.preventDefault(); if (organization) setStep(4); }}><SearchSelect kind="organization" selected={organization} search={organizationSearch} results={organizationResults} loading={referenceLoading} error={referenceError} onSearchChange={(event) => changeReferenceSearch("organization", event.target.value)} onSelect={selectOrganization} onRetry={() => setSearchVersion((version) => version + 1)} /><Actions step={step} onBack={back} isSubmitting={isSubmitting} disabled={!organization} /></form>;
    if (step === 3 && role === "government") return <form onSubmit={(event) => { event.preventDefault(); setStep(4); }}><Input label="Department / office name" name="department" placeholder={governmentLevel === "BLOCK" ? "e.g. Block Development Office (BDO)" : "Enter department or office name"} value={form.department || ""} onChange={setField} />{governmentLevel === "STATE" && <div className="register-input-group"><label>State</label><input value="Jharkhand" readOnly /></div>}{governmentLevel !== "STATE" && <div className="register-input-group"><label htmlFor="districtId">District</label><select id="districtId" name="districtId" value={form.districtId || ""} onChange={selectDistrict} required disabled={districtLoading}><option value="">{districtLoading ? "Loading districts…" : "Select a district"}</option>{districts.map((district) => <option key={district._id} value={district._id}>{district.name}</option>)}</select>{districtError && <p className="register-search-feedback register-search-error" role="alert">{districtError}</p>}</div>}{["BLOCK", "RURAL"].includes(governmentLevel) && <div className="register-input-group"><label htmlFor="blockId">Block</label><select id="blockId" name="blockId" value={form.blockId || ""} onChange={selectBlock} required disabled={!form.districtId || blockLoading}><option value="">{blockLoading ? "Loading blocks…" : "Select a block"}</option>{blocks.map((block) => <option key={block._id} value={block._id}>{block.name}</option>)}</select>{blockError && <p className="register-search-feedback register-search-error" role="alert">{blockError}</p>}</div>}{governmentLevel === "RURAL" && <div className="register-input-group"><label htmlFor="villageId">Village</label><select id="villageId" name="villageId" value={form.villageId || ""} onChange={selectVillage} required disabled={!form.blockId || villageLoading}><option value="">{villageLoading ? "Loading villages…" : "Select a village"}</option>{villages.map((village) => <option key={village._id} value={village._id}>{village.name}</option>)}</select>{villageError && <p className="register-search-feedback register-search-error" role="alert">{villageError}</p>}</div>}{governmentLevel === "LOCAL" && <div className="register-input-group"><label htmlFor="ulbId">Urban local body</label><select id="ulbId" name="ulbId" value={form.ulbId || ""} onChange={selectUlb} required disabled={!form.districtId || ulbLoading}><option value="">{ulbLoading ? "Loading urban local bodies…" : "Select an urban local body"}</option>{ulbs.map((ulb) => <option key={ulb._id} value={ulb._id}>{ulb.name}</option>)}</select>{ulbError && <p className="register-search-feedback register-search-error" role="alert">{ulbError}</p>}</div>}<Actions step={step} onBack={back} isSubmitting={isSubmitting} /></form>;
    if (step === 4 && isHeiAdmin) return <form onSubmit={submit}><AccountDetails form={form} onChange={setField} /><Input label="Institutional verification ID" name="verificationId" placeholder="Enter employee or authorization ID" value={form.verificationId || ""} onChange={setField} /><Input label="Official designation" name="designation" placeholder="Enter your designation" value={form.designation || ""} onChange={setField} /><p className="register-status-note"><strong>Pending Approval</strong>Your account will be reviewed by the System Admin.</p><Actions step={step} onBack={back} isSubmitting={isSubmitting} submitLabel="Submit for review" /></form>;
    if (step === 4 && isFacultyOrStudent) return <form onSubmit={submit}><AccountDetails form={form} onChange={setField} /><Input label={accountType === "faculty" ? "Faculty ID" : "Student ID"} name="institutionMemberId" placeholder="Enter your institutional ID" value={form.institutionMemberId || ""} onChange={setField} /><Input label="Department or course" name="departmentCourse" placeholder="Enter department or course" value={form.departmentCourse || ""} onChange={setField} /><p className="register-status-note"><strong>Pending Verification</strong>Your account will be verified by the institution.</p><Actions step={step} onBack={back} isSubmitting={isSubmitting} submitLabel="Submit for verification" /></form>;
    if (step === 4 && isOrganizationAdmin) return <form onSubmit={submit}><AccountDetails form={form} onChange={setField} /><Input label="Organization name" name="organizationName" placeholder="Enter organization name" value={form.organizationName || ""} onChange={setField} /><Input label="Organization / registration ID" name="registrationId" placeholder="Enter registration ID" value={form.registrationId || ""} onChange={setField} /><Input label="Verification details" name="organizationVerification" placeholder="Enter required verification details" value={form.organizationVerification || ""} onChange={setField} /><p className="register-status-note"><strong>Pending Approval</strong>Your organization will be reviewed by the System Admin.</p><Actions step={step} onBack={back} isSubmitting={isSubmitting} submitLabel="Submit for review" /></form>;
    if (step === 4 && isMentor) return <form onSubmit={submit}><AccountDetails form={form} onChange={setField} /><Summary rows={[["Organization", organization?.organizationName], ["Organization type", organization?.organizationType], ["Request", "Request to join this organization"]]} /><p className="register-status-note"><strong>Pending Organization Approval</strong>Your request will be sent to this organization.</p><Actions step={step} onBack={back} isSubmitting={isSubmitting} submitLabel="Request to join" /></form>;
    return <form onSubmit={submit}><AccountDetails form={form} onChange={setField} /><Summary rows={[["Government level", governmentLevel], ["Department / office", form.department], ...(governmentLevel === "STATE" ? [["State", "Jharkhand"]] : [["District", form.districtName]]), ...(["BLOCK", "RURAL"].includes(governmentLevel) ? [["Block", form.blockName]] : []), ...(governmentLevel === "LOCAL" ? [["Urban local body", form.ulbName]] : []), ...(governmentLevel === "RURAL" ? [["Village", form.villageName]] : [])]} /><p className="register-status-note"><strong>Pending Approval</strong>Your account will be reviewed by the System Admin.</p><Actions step={step} onBack={back} isSubmitting={isSubmitting} submitLabel="Submit for review" /></form>;
  };

  return <div className={`register-page register-theme-${theme} register-text-${textScale}`}>
    <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />
    <main className="register-main"><section className="register-intro" aria-label="JanSamadhan registration"><Link className="register-logo" to="/" aria-label="JanSamadhan home"><img src={theme === "light" ? lightLogo : darkLogo} alt="JanSamadhan — Initiative by Government of Jharkhand" /></Link><div className="register-intro-copy"><p className="register-eyebrow">Together, for Jharkhand</p><h1>Join the solution.</h1><p>Create an account that matches how you can help solve local challenges.</p></div><Link className="register-home-link" to="/">← Back to home</Link></section><section className="register-form-area" aria-labelledby="register-title"><div className="register-box"><div className="register-progress" aria-label={`Step ${step} of ${totalSteps}`}><span>Step {complete ? totalSteps : step} of {totalSteps}</span><div aria-hidden="true"><i style={{ width: `${((complete ? totalSteps : step) / totalSteps) * 100}%` }} /></div></div><div className="register-heading"><p className="register-eyebrow">{eyebrow}</p><h2 id="register-title">{title}</h2></div>{registrationError && <p className="register-search-feedback register-search-error" role="alert">{registrationError}</p>}{renderStep()}</div></section></main>
  </div>;
}

export default Register;
