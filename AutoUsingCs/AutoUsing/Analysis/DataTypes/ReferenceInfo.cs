namespace AutoUsing.Analysis.DataTypes
{
    public class ReferenceInfo
    {
        public string Name { get; set; }
        public string Namespace { get; set; }

        public ReferenceInfo(string name, string ns)
        {
            Name = name;
            Namespace = ns;
        }
        
        

        protected bool Equals(ReferenceInfo other)
        {
            return string.Equals(Name, other.Name) && string.Equals(Namespace, other.Namespace);
        }

        public override bool Equals(object obj)
        {
            if (ReferenceEquals(null, obj)) return false;
            if (ReferenceEquals(this, obj)) return true;
            if (obj.GetType() != this.GetType()) return false;
            return Equals((ReferenceInfo) obj);
        }

        public override int GetHashCode()
        {
            unchecked
            {
                return ((Name != null ? Name.GetHashCode() : 0) * 397) ^ (Namespace != null ? Namespace.GetHashCode() : 0);
            }
        }
    }
}